"""
Budget app test suite.

Tests cover:
  1. compute_allocation() â€” ratio math for all 3 modes
  2. SalarySubmitSerializer â€” validation edge cases
  3. POST /api/dashboard/salary/ â€” happy path + lock enforcement
  4. GET /api/dashboard/ â€” empty state + populated state + DSL floor rule
  5. POST /api/dashboard/lock/ â€” locking + forward-only behaviour
  6. transfer_between_buckets() â€” atomicity, hard floor, DSL soft floor
"""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.budget.models import BucketBalance, BucketTransaction, MonthlyAllocation
from core.services.allocation import compute_allocation
from core.utils.atomic_ops import InsufficientFundsError, transfer_between_buckets


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(email="test@example.com", password="testpass123"):
    return User.objects.create_user(username=email, email=email, password=password)


def get_token(client, email="test@example.com", password="testpass123"):
    resp = client.post(
        reverse("token_obtain_pair"),
        {"username": email, "password": password},
        format="json",
    )
    return resp.data["access"]


# ---------------------------------------------------------------------------
# 1. compute_allocation()
# ---------------------------------------------------------------------------

class ComputeAllocationTests(TestCase):
    def test_focused_ratios(self):
        result = compute_allocation(Decimal("100000"), "focused")
        self.assertEqual(result["major"], Decimal("50000.00"))
        self.assertEqual(result["dsl"], Decimal("15000.00"))
        self.assertEqual(result["savings"], Decimal("25000.00"))
        self.assertEqual(result["buffer_reserve"], Decimal("10000.00"))

    def test_balanced_ratios(self):
        result = compute_allocation(Decimal("100000"), "balanced")
        self.assertEqual(result["major"], Decimal("50000.00"))
        self.assertEqual(result["dsl"], Decimal("25000.00"))
        self.assertEqual(result["savings"], Decimal("15000.00"))
        self.assertEqual(result["buffer_reserve"], Decimal("10000.00"))

    def test_amounts_sum_to_salary(self):
        """The 4 bucket amounts must ALWAYS sum exactly to salary (rounding guard)."""
        for salary_str in ("52000", "33333.33", "99999.99", "1000"):
            salary = Decimal(salary_str)
            for mode in ("focused", "balanced"):
                result = compute_allocation(salary, mode)
                self.assertEqual(
                    sum(result.values()),
                    salary,
                    msg=f"Amounts don't sum to salary for mode={mode}, salary={salary}",
                )

    def test_custom_mode_valid(self):
        ratios = {
            "major": Decimal("40"),
            "dsl": Decimal("30"),
            "savings": Decimal("20"),
            "buffer_reserve": Decimal("10"),
        }
        result = compute_allocation(Decimal("100000"), "custom", ratios)
        self.assertEqual(result["major"], Decimal("40000.00"))
        self.assertEqual(result["dsl"], Decimal("30000.00"))

    def test_custom_mode_invalid_sum_raises(self):
        ratios = {
            "major": Decimal("40"),
            "dsl": Decimal("30"),
            "savings": Decimal("20"),
            "buffer_reserve": Decimal("5"),   # sum = 95, not 100
        }
        with self.assertRaises(ValueError, msg="Should reject ratios that don't sum to 100"):
            compute_allocation(Decimal("100000"), "custom", ratios)

    def test_unknown_mode_raises(self):
        with self.assertRaises(ValueError):
            compute_allocation(Decimal("50000"), "foody")

    def test_custom_missing_ratios_raises(self):
        with self.assertRaises(ValueError):
            compute_allocation(Decimal("50000"), "custom", None)


# ---------------------------------------------------------------------------
# 2. SalarySubmitSerializer validation
# ---------------------------------------------------------------------------

class SalarySerializerTests(TestCase):
    from apps.budget.serializers import SalarySubmitSerializer

    def _serialize(self, data):
        from apps.budget.serializers import SalarySubmitSerializer
        s = SalarySubmitSerializer(data=data)
        return s

    def test_valid_focused(self):
        s = self._serialize({"salary": "52000", "mode": "focused"})
        self.assertTrue(s.is_valid(), s.errors)

    def test_salary_zero_invalid(self):
        s = self._serialize({"salary": "0", "mode": "balanced"})
        self.assertFalse(s.is_valid())
        self.assertIn("salary", s.errors)

    def test_salary_negative_invalid(self):
        s = self._serialize({"salary": "-1000", "mode": "focused"})
        self.assertFalse(s.is_valid())

    def test_custom_mode_missing_ratios(self):
        s = self._serialize({"salary": "50000", "mode": "custom"})
        self.assertFalse(s.is_valid())

    def test_custom_mode_ratios_not_summing_to_100(self):
        s = self._serialize({
            "salary": "50000", "mode": "custom",
            "ratio_major": "40", "ratio_dsl": "30",
            "ratio_savings": "20", "ratio_emergency": "5",
        })
        self.assertFalse(s.is_valid())
        # Error message should mention 100%
        error_str = str(s.errors)
        self.assertIn("100", error_str)

    def test_custom_mode_valid_ratios(self):
        s = self._serialize({
            "salary": "50000", "mode": "custom",
            "ratio_major": "40", "ratio_dsl": "30",
            "ratio_savings": "20", "ratio_emergency": "10",
        })
        self.assertTrue(s.is_valid(), s.errors)


# ---------------------------------------------------------------------------
# 3 & 4. API endpoint tests
# ---------------------------------------------------------------------------

class DashboardAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()
        token = get_token(self.client)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # -- GET: new user empty state --
    def test_get_dashboard_empty_state(self):
        resp = self.client.get(reverse("dashboard"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["has_allocation"])
        self.assertIsNone(data["salary"])
        # All bucket balances should be 0.00
        for bucket in ("major", "dsl", "savings", "buffer_reserve"):
            self.assertEqual(
                Decimal(data["buckets"][bucket]["balance"]),
                Decimal("0"),
            )

    # -- POST: set salary --
    def test_post_salary_focused(self):
        resp = self.client.post(
            reverse("dashboard-salary"),
            {"salary": "52000", "mode": "focused"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["has_allocation"])
        self.assertEqual(data["mode"], "focused")
        self.assertEqual(data["applied_to"], "current_month")
        self.assertEqual(Decimal(data["buckets"]["major"]["balance"]), Decimal("26000.00"))
        self.assertEqual(Decimal(data["buckets"]["dsl"]["balance"]), Decimal("7800.00"))
        self.assertEqual(Decimal(data["buckets"]["savings"]["balance"]), Decimal("13000.00"))
        self.assertEqual(Decimal(data["buckets"]["buffer_reserve"]["balance"]), Decimal("5200.00"))

    def test_post_salary_validation_error(self):
        resp = self.client.post(
            reverse("dashboard-salary"),
            {"salary": "0", "mode": "focused"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_post_salary_custom_mode(self):
        resp = self.client.post(
            reverse("dashboard-salary"),
            {
                "salary": "100000",
                "mode": "custom",
                "ratio_major": "40",
                "ratio_dsl": "30",
                "ratio_savings": "20",
                "ratio_emergency": "10",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(Decimal(data["buckets"]["major"]["balance"]), Decimal("40000.00"))

    def test_post_custom_invalid_sum_returns_400(self):
        resp = self.client.post(
            reverse("dashboard-salary"),
            {
                "salary": "100000",
                "mode": "custom",
                "ratio_major": "40",
                "ratio_dsl": "30",
                "ratio_savings": "20",
                "ratio_emergency": "5",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    # -- Lock enforcement (forward-only rule) --
    def test_locked_month_applies_to_next_month(self):
        # 1. Create and lock current month
        self.client.post(
            reverse("dashboard-salary"),
            {"salary": "52000", "mode": "focused"},
            format="json",
        )
        self.client.post(reverse("dashboard-lock"))

        # 2. Update salary â€” should go to next month
        resp = self.client.post(
            reverse("dashboard-salary"),
            {"salary": "60000", "mode": "balanced"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["applied_to"], "next_month")

        # 3. Current month allocation should still show the original salary
        from django.utils import timezone
        today = timezone.localdate()
        alloc = MonthlyAllocation.objects.get(
            user=self.user, month=today.month, year=today.year
        )
        self.assertEqual(alloc.salary, Decimal("52000.00"))


# ---------------------------------------------------------------------------
# 5. Lock endpoint
# ---------------------------------------------------------------------------

class LockAllocationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()
        token = get_token(self.client)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_lock_no_allocation_returns_400(self):
        resp = self.client.post(reverse("dashboard-lock"))
        self.assertEqual(resp.status_code, 400)

    def test_lock_sets_is_locked_true(self):
        self.client.post(
            reverse("dashboard-salary"),
            {"salary": "52000", "mode": "focused"},
            format="json",
        )
        resp = self.client.post(reverse("dashboard-lock"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["is_locked"])


# ---------------------------------------------------------------------------
# 6. transfer_between_buckets() atomicity
# ---------------------------------------------------------------------------

class TransferBetweenBucketsTests(TestCase):
    def setUp(self):
        self.user = make_user()
        # Create a basic allocation + bucket balances directly
        self.client = APIClient()
        token = get_token(APIClient())
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        api.post(
            reverse("dashboard-salary"),
            {"salary": "100000", "mode": "balanced"},
            format="json",
        )
        from django.utils import timezone
        today = timezone.localdate()
        self.allocation = MonthlyAllocation.objects.get(
            user=self.user, month=today.month, year=today.year
        )

    def _balance(self, bucket_type):
        return BucketBalance.objects.get(
            user=self.user, bucket_type=bucket_type, allocation=self.allocation
        ).current_balance

    def test_transfer_deducts_and_credits(self):
        # Move â‚¹5000 from savings to emergency
        transfer_between_buckets(
            user=self.user,
            from_bucket_type="savings",
            to_bucket_type="buffer_reserve",
            amount=Decimal("5000"),
            reason="test transfer",
            allocation=self.allocation,
        )
        self.assertEqual(self._balance("savings"), Decimal("10000.00"))  # 15000 - 5000
        self.assertEqual(self._balance("buffer_reserve"), Decimal("15000.00"))  # 10000 + 5000

    def test_audit_log_created(self):
        transfer_between_buckets(
            user=self.user,
            from_bucket_type="savings",
            to_bucket_type="buffer_reserve",
            amount=Decimal("1000"),
            reason="audit test",
            allocation=self.allocation,
        )
        log = BucketTransaction.objects.filter(
            user=self.user,
            source_bucket="savings",
            destination_bucket="buffer_reserve",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.amount, Decimal("1000"))

    def test_hard_floor_emergency_raises(self):
        """Emergency Fund must never go negative."""
        with self.assertRaises(InsufficientFundsError):
            transfer_between_buckets(
                user=self.user,
                from_bucket_type="buffer_reserve",
                to_bucket_type="savings",
                amount=Decimal("999999"),  # way more than balance
                reason="should fail",
                allocation=self.allocation,
            )

    def test_atomicity_on_failure(self):
        """
        If the credit side fails after the debit, the entire operation
        must roll back (no money disappears).
        """
        savings_before = self._balance("savings")
        emergency_before = self._balance("buffer_reserve")

        with self.assertRaises(Exception):
            with patch(
                "apps.budget.models.BucketBalance.save",
                side_effect=[None, Exception("simulated DB failure")],
            ):
                transfer_between_buckets(
                    user=self.user,
                    from_bucket_type="savings",
                    to_bucket_type="buffer_reserve",
                    amount=Decimal("1000"),
                    reason="atomicity test",
                    allocation=self.allocation,
                )

        # Balances should be unchanged after rollback
        self.assertEqual(self._balance("savings"), savings_before)
        self.assertEqual(self._balance("buffer_reserve"), emergency_before)

    def test_dsl_soft_floor_allows_negative_internally(self):
        """DSL can go negative (overspend); that's caught by the view layer."""
        transfer_between_buckets(
            user=self.user,
            from_bucket_type="dsl",
            to_bucket_type="buffer_reserve",
            amount=Decimal("999999"),  # far exceeds DSL balance
            reason="dsl overspend test",
            allocation=self.allocation,
        )
        dsl_balance = self._balance("dsl")
        self.assertLess(dsl_balance, Decimal("0"))


# ---------------------------------------------------------------------------
# 7. GoalSerializer — input validation edge cases
# ---------------------------------------------------------------------------

from apps.budget.serializers import GoalSerializer   # noqa: E402


class GoalSerializerValidationTests(TestCase):
    """
    Ensures GoalSerializer rejects all invalid inputs described in the spec:
      - Negative target_amount
      - Malformed / non-numeric strings (DRF DecimalField rejects these)
      - Excessively large target_amount (> 1 Crore)
      - Blank / whitespace-only name
      - Name shorter than 2 characters
      - Valid edge cases that must be ACCEPTED
    """

    BASE = {
        'name': 'Vacation Goa',
        'target_amount': '50000',
        'priority': 0,
        'allocation_mode': 'manual',
    }

    def _ser(self, overrides):
        data = {**self.BASE, **overrides}
        return GoalSerializer(data=data)

    # Name validation
    def test_name_blank_rejected(self):
        s = self._ser({'name': ''})
        self.assertFalse(s.is_valid())
        self.assertIn('name', s.errors)

    def test_name_whitespace_only_rejected(self):
        s = self._ser({'name': '   '})
        self.assertFalse(s.is_valid())
        self.assertIn('name', s.errors)

    def test_name_single_char_rejected(self):
        s = self._ser({'name': 'A'})
        self.assertFalse(s.is_valid())
        self.assertIn('name', s.errors)

    def test_name_two_chars_accepted(self):
        s = self._ser({'name': 'Go'})
        self.assertTrue(s.is_valid(), s.errors)

    def test_name_leading_trailing_whitespace_stripped(self):
        s = self._ser({'name': '  Holiday  '})
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data['name'], 'Holiday')

    def test_name_over_100_chars_rejected(self):
        s = self._ser({'name': 'A' * 101})
        self.assertFalse(s.is_valid())
        self.assertIn('name', s.errors)

    # Target amount validation
    def test_target_negative_rejected(self):
        s = self._ser({'target_amount': '-1'})
        self.assertFalse(s.is_valid())
        self.assertIn('target_amount', s.errors)

    def test_target_zero_accepted_on_creation(self):
        s = self._ser({'target_amount': '0'})
        self.assertTrue(s.is_valid(), s.errors)

    def test_target_over_cap_rejected(self):
        s = self._ser({'target_amount': '10000001'})
        self.assertFalse(s.is_valid())
        self.assertIn('target_amount', s.errors)

    def test_target_exactly_at_cap_accepted(self):
        s = self._ser({'target_amount': '10000000'})
        self.assertTrue(s.is_valid(), s.errors)

    def test_target_non_numeric_string_rejected(self):
        s = self._ser({'target_amount': '542-25245'})
        self.assertFalse(s.is_valid())
        self.assertIn('target_amount', s.errors)

    def test_target_alphanumeric_rejected(self):
        s = self._ser({'target_amount': 'abc'})
        self.assertFalse(s.is_valid())
        self.assertIn('target_amount', s.errors)

    def test_target_empty_string_rejected(self):
        s = self._ser({'target_amount': ''})
        self.assertFalse(s.is_valid())
        self.assertIn('target_amount', s.errors)

    def test_valid_goal_accepted(self):
        s = self._ser({})
        self.assertTrue(s.is_valid(), s.errors)

    def test_valid_goal_with_decimal_target_accepted(self):
        s = self._ser({'target_amount': '75000.50'})
        self.assertTrue(s.is_valid(), s.errors)


