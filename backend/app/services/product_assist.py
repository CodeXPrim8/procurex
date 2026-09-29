import json
import logging
import re
from typing import Any, Dict, Optional

from ..core.config import settings

logger = logging.getLogger(__name__)

GOODS_CATEGORIES = {
    "Laptop",
    "Desktop",
    "Tablet",
    "Phone",
    "Monitor",
    "Keyboard",
    "Mouse",
    "Printer",
    "Server",
    "Networking",
    "Storage",
    "Accessories",
}


def listing_kind(category: str) -> str:
    value = (category or "").strip()
    if value == "Software":
        return "software"
    if value == "Service":
        return "service"
    if value:
        return "goods"
    return ""


def _fallback_description(name: str, category: str, specifications: Optional[Dict[str, Any]] = None) -> str:
    specs = specifications or {}
    bits = [str(value).strip() for value in specs.values() if str(value or "").strip()]
    spec_text = f" Key details: {', '.join(bits)}." if bits else ""
    kind = listing_kind(category)
    if kind == "software":
        return (
            f"{name} is software for Nigerian businesses.{spec_text} "
            "It helps teams run this workflow with a clear setup and ongoing use."
        )
    if kind == "service":
        return (
            f"{name} is a professional service.{spec_text} "
            "The engagement covers delivery, handover, and support so the buyer can go live with confidence."
        )
    return (
        f"{name} is a {category.lower()} for office and business use.{spec_text} "
        "Suitable for procurement teams that need a reliable, in-stock option."
    )


def assist_product_listing(
    name: str,
    category: str,
    specifications: Optional[Dict[str, Any]] = None,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    category = (category or "").strip()
    name = (name or "").strip()
    kind = listing_kind(category)
    payload = {
        "kind": kind or "goods",
        "kind_label": {
            "goods": "Physical goods",
            "software": "Software",
            "service": "Service",
        }.get(kind or "goods", "Physical goods"),
        "suggested_category": category or None,
        "category_mismatch": False,
        "description": (description or "").strip() or _fallback_description(name, category, specifications),
        "note": "",
        "image_rule": (
            "Upload a screenshot, logo, or portfolio image. Photos of unrelated objects will be rejected."
            if kind in {"software", "service"}
            else "Upload a real photo of this exact product. Logos, screenshots, illustrations, and unrelated pictures will be rejected."
        ),
    }
    if not name or not category:
        payload["note"] = "Choose a category first, then enter the product name for AI help."
        return payload

    if not settings.GEMINI_API_KEY:
        payload["note"] = "AI assist is using a local draft until an AI key is available."
        return payload

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(settings.GEMINI_MODEL or "gemini-flash-lite-latest")
        allowed = ", ".join(sorted(GOODS_CATEGORIES | {"Software", "Service"}))
        prompt = f"""You help a Nigerian IT procurement marketplace vendor write a listing.
Product name: {name}
Chosen category: {category}
Specifications JSON: {json.dumps(specifications or {})}
Existing description: {(description or "").strip() or "(empty)"}

Decide whether this listing is physical goods, software, or a professional service.
If the chosen category is wrong, recommend one category from: {allowed}

Write a buyer-facing description in 1-3 sentences. Be specific. Do not invent SKUs or prices.

Reply with JSON only:
{{
  "kind": "goods" | "software" | "service",
  "suggested_category": "one allowed category",
  "category_mismatch": true,
  "description": "1-3 sentences",
  "note": "short warning if the name does not match the category, else empty"
}}
"""
        response = model.generate_content(prompt)
        text = (response.text or "").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            return payload
        parsed = json.loads(text[start : end + 1])
        suggested = str(parsed.get("suggested_category") or category).strip()
        parsed_kind = str(parsed.get("kind") or kind).strip().lower()
        if parsed_kind not in {"goods", "software", "service"}:
            parsed_kind = kind or "goods"
        if suggested not in GOODS_CATEGORIES and suggested not in {"Software", "Service"}:
            suggested = category
        mismatch = bool(parsed.get("category_mismatch")) or (
            suggested and category and suggested.lower() != category.lower()
        )
        description_text = str(parsed.get("description") or "").strip()
        if not description_text:
            description_text = payload["description"]
        description_text = re.sub(r"\s+", " ", description_text).strip()
        payload.update(
            {
                "kind": parsed_kind,
                "kind_label": {
                    "goods": "Physical goods",
                    "software": "Software",
                    "service": "Service",
                }.get(parsed_kind, "Physical goods"),
                "suggested_category": suggested,
                "category_mismatch": mismatch,
                "description": description_text,
                "note": str(parsed.get("note") or "").strip(),
                "image_rule": (
                    "Upload a screenshot, logo, or portfolio image. Photos of unrelated objects will be rejected."
                    if parsed_kind in {"software", "service"}
                    else "Upload a real photo of this exact product. Logos, screenshots, illustrations, and unrelated pictures will be rejected."
                ),
            }
        )
        if mismatch and not payload["note"]:
            payload["note"] = f"This name looks like {suggested}, not {category}."
        return payload
    except Exception as exc:
        logger.warning("Product assist fallback: %s", exc)
        payload["note"] = "AI assist used a local draft."
        return payload
