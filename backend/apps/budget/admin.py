from django.contrib import admin

from .models import BucketBalance, BucketTransaction, MonthlyAllocation


@admin.register(MonthlyAllocation)
class MonthlyAllocationAdmin(admin.ModelAdmin):
    list_display = (
        "user", "month", "year", "salary", "mode",
        "ratio_major", "ratio_dsl", "ratio_savings", "ratio_emergency", "is_locked",
    )
    list_filter = ("mode", "is_locked", "year")
    search_fields = ("user__email",)
    ordering = ("-year", "-month")
    readonly_fields = ("created_at", "updated_at")


@admin.register(BucketBalance)
class BucketBalanceAdmin(admin.ModelAdmin):
    list_display = ("user", "bucket_type", "current_balance", "allocation")
    list_filter = ("bucket_type",)
    search_fields = ("user__email",)


@admin.register(BucketTransaction)
class BucketTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "user", "source_bucket", "destination_bucket", "amount", "timestamp", "reason"
    )
    list_filter = ("source_bucket", "destination_bucket")
    search_fields = ("user__email", "reason")
    ordering = ("-timestamp",)
    readonly_fields = ("timestamp",)
