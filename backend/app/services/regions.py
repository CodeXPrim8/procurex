"""Buyer region, vendor origin country, and which listings a buyer in a given country can see."""
from __future__ import annotations

import re
from typing import Optional

DEFAULT_VENDOR_COUNTRY = "NG"
DELIVERY_MODES = {"remote", "onsite"}

_COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


class RegionError(ValueError):
    pass


def normalize_country(value: Optional[str]) -> Optional[str]:
    code = (value or "").strip().upper()
    if not code:
        return None
    if not _COUNTRY_RE.match(code):
        raise RegionError("Country must be a 2-letter ISO code, e.g. NG, US, GB.")
    return code


def safe_country(value: Optional[str]) -> Optional[str]:
    try:
        return normalize_country(value)
    except RegionError:
        return None


def normalize_currency(value: Optional[str]) -> Optional[str]:
    code = (value or "").strip().upper()
    if not code:
        return None
    if not _CURRENCY_RE.match(code):
        raise RegionError("Currency must be a 3-letter ISO code, e.g. NGN, USD, EUR.")
    return code


def resolve_delivery_mode(category: Optional[str], delivery_mode: Optional[str]) -> Optional[str]:
    """Services must say whether they are delivered remotely or onsite; other listings carry no mode."""
    if (category or "").strip().lower() != "service":
        return None
    mode = (delivery_mode or "").strip().lower()
    if mode not in DELIVERY_MODES:
        raise RegionError("Choose whether this service is delivered remotely or onsite.")
    return mode


def availability_scope(category: Optional[str], delivery_mode: Optional[str]) -> str:
    """'worldwide' for software and remote services; 'country' for goods and onsite services."""
    kind = (category or "").strip().lower()
    if kind == "software":
        return "worldwide"
    if kind == "service" and (delivery_mode or "").lower() == "remote":
        return "worldwide"
    return "country"


def vendor_country(vendor) -> str:
    return safe_country(getattr(vendor, "country", None)) or DEFAULT_VENDOR_COUNTRY


def buyer_country_for(user, requested: Optional[str] = None) -> Optional[str]:
    """The region a buyer chose on their account wins; otherwise use the browser-detected country."""
    return safe_country(getattr(user, "country", None)) or safe_country(requested)


def visible_in(buyer_country: Optional[str], category: Optional[str], delivery_mode: Optional[str], origin_country: str) -> bool:
    """Unknown buyer country sees everything; otherwise country-scoped listings must match the vendor's country."""
    if not buyer_country:
        return True
    if availability_scope(category, delivery_mode) == "worldwide":
        return True
    return origin_country == buyer_country
