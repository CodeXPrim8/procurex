"""Remember each buyer's sourcing habits and turn them into search boosts plus AI notes."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.buyer import BuyerMemory
from ..models.product import Product


def get_memory(db: Session, user_id: Optional[int]) -> Optional[BuyerMemory]:
    if not user_id:
        return None
    return db.query(BuyerMemory).filter(BuyerMemory.user_id == user_id).first()


def _bump(counts: Optional[dict], key: Optional[str], by: int = 1) -> dict:
    data = dict(counts or {})
    if not key:
        return data
    data[key] = int(data.get(key) or 0) + by
    return data


def remember_search(
    db: Session,
    user_id: Optional[int],
    *,
    category: Optional[str],
    brand: Optional[str],
    spec_hints: Optional[Dict[str, str]],
    query: Optional[str],
    rows: Optional[List[Dict[str, Any]]] = None,
) -> Optional[BuyerMemory]:
    if not user_id:
        return None
    row = get_memory(db, user_id)
    if not row:
        row = BuyerMemory(user_id=user_id)
        db.add(row)
    row.category_counts = _bump(row.category_counts, category)
    row.brand_counts = _bump(row.brand_counts, brand)
    specs = dict(row.spec_counts or {})
    for key, value in (spec_hints or {}).items():
        bucket = dict(specs.get(key) or {})
        bucket[value] = int(bucket.get(value) or 0) + 1
        specs[key] = bucket
    row.spec_counts = specs
    matched = [
        item["id"]
        for item in (rows or [])
        if item.get("id") and item.get("match_kind") in {"exact", "close"}
    ]
    if matched:
        previous = [int(item) for item in (row.product_ids or []) if item]
        row.product_ids = list(dict.fromkeys([*matched, *previous]))[:24]
    if query:
        row.last_query = (query or "").strip()[:500]
    row.summary = format_notes(row)
    row.updated_at = datetime.utcnow()
    db.flush()
    return row


def format_notes(row: Optional[BuyerMemory]) -> str:
    if not row:
        return ""
    lines: List[str] = []
    cats = _top(row.category_counts)
    brands = _top(row.brand_counts)
    if cats:
        lines.append("Usually shops for: " + ", ".join(cats) + ".")
    if brands:
        lines.append("Brands they come back to: " + ", ".join(brands) + ".")
    spec_bits = []
    for key, bucket in (row.spec_counts or {}).items():
        winners = _top(bucket)
        if winners:
            spec_bits.append(f"{key} {winners[0]}")
    if spec_bits:
        lines.append("Spec habits: " + ", ".join(spec_bits) + ".")
    if row.last_query:
        lines.append(f"Last request: {row.last_query}")
    return " ".join(lines)


def search_bias(row: Optional[BuyerMemory]) -> Dict[str, Any]:
    if not row:
        return {}
    specs = {}
    for key, bucket in (row.spec_counts or {}).items():
        winners = _top(bucket)
        if winners:
            specs[key] = winners[0]
    return {
        "categories": _top(row.category_counts),
        "brands": [item.lower() for item in _top(row.brand_counts)],
        "specs": specs,
        "product_ids": [int(item) for item in (row.product_ids or []) if item][:12],
    }


def remembered_product_names(db: Session, row: Optional[BuyerMemory]) -> List[str]:
    ids = [int(item) for item in ((row.product_ids if row else None) or []) if item][:6]
    if not ids:
        return []
    products = db.query(Product).filter(Product.id.in_(ids)).all()
    by_id = {item.id: item.name for item in products}
    return [by_id[item] for item in ids if item in by_id]


def _top(counts: Optional[dict], limit: int = 3) -> List[str]:
    if not counts:
        return []
    ranked = sorted(counts.items(), key=lambda item: int(item[1] or 0), reverse=True)
    return [str(key) for key, value in ranked if key and int(value or 0) > 0][:limit]
