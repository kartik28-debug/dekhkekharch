from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "username", "is_onboarded", "is_staff")
    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "Finance App",
            {
                "fields": (
                    "is_onboarded",
                    "last_custom_ratio_major",
                    "last_custom_ratio_dsl",
                    "last_custom_ratio_savings",
                    "last_custom_ratio_emergency",
                )
            },
        ),
    )
