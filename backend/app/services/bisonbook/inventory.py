"""Inventory: stock movements are the source of truth for VendorProduct.stock_quantity."""
from __future__ import annotations

from collections import deque
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ...models.bisonbook import StockMovement
from ...models.product import VendorProduct
from ...models.vendor import Vendor
from . import ledger
from .common import BisonBookError, get_settings, money

MOVEMENT_TYPES = {"opening", "in", "out", "adjust", "sale", "return"}


def listing_for_vendor(db: Session, vendor: Vendor, listing_id: int) -> VendorProduct:
    row = (
        db.query(VendorProduct)
        .options(joinedload(VendorProduct.product))
        .filter(VendorProduct.vendor_id == vendor.id, VendorProduct.id == listing_id)
        .first()
    )
    if not row:
        raise BisonBookError("Product not found in your inventory.")
    return row


def ensure_opening_movements(db: Session, vendor: Vendor) -> None:
    """Backfill one opening movement per listing that predates BisonBook."""
    tracked = {
        row[0]
        for row in db.query(StockMovement.vendor_product_id).filter(StockMovement.vendor_id == vendor.id).distinct()
    }
    added = False
    for listing in db.query(VendorProduct).filter(VendorProduct.vendor_id == vendor.id).all():
        if listing.id in tracked:
            continue
        qty = int(listing.stock_quantity or 0)
        db.add(StockMovement(
            vendor_id=vendor.id,
            vendor_product_id=listing.id,
            movement_type="opening",
            quantity=qty,
            unit_cost=listing.unit_cost,
            reference="Opening balance",
            note="Stock on hand when BisonBook was enabled.",
            created_by="BisonBook",
        ))
        added = True
    if added:
        db.flush()


def _sync_listing_stock(db: Session, listing: VendorProduct) -> int:
    total = (
        db.query(func.coalesce(func.sum(StockMovement.quantity), 0))
        .filter(StockMovement.vendor_product_id == listing.id)
        .scalar()
    )
    listing.stock_quantity = int(total or 0)
    return listing.stock_quantity


def average_cost(db: Session, listing: VendorProduct) -> float:
    rows = (
        db.query(StockMovement)
        .filter(
            StockMovement.vendor_product_id == listing.id,
            StockMovement.quantity > 0,
            StockMovement.unit_cost.isnot(None),
        )
        .all()
    )
    qty = sum(r.quantity for r in rows)
    if qty <= 0:
        return money(listing.unit_cost or 0)
    return money(sum(r.quantity * (r.unit_cost or 0) for r in rows) / qty)


def fifo_value(db: Session, listing: VendorProduct) -> float:
    layers: deque = deque()
    fallback = listing.unit_cost or 0
    for move in (
        db.query(StockMovement)
        .filter(StockMovement.vendor_product_id == listing.id)
        .order_by(StockMovement.created_at, StockMovement.id)
    ):
        if move.quantity > 0:
            layers.append([move.quantity, move.unit_cost if move.unit_cost is not None else fallback])
            continue
        remaining = -move.quantity
        while remaining > 0 and layers:
            take = min(remaining, layers[0][0])
            layers[0][0] -= take
            remaining -= take
            if layers[0][0] == 0:
                layers.popleft()
    return money(sum(qty * cost for qty, cost in layers))


def record_movement(
    db: Session,
    vendor: Vendor,
    listing: VendorProduct,
    *,
    movement_type: str,
    quantity: int,
    unit_cost: Optional[float] = None,
    reference: Optional[str] = None,
    note: Optional[str] = None,
    created_by: Optional[str] = None,
    paid_via: Optional[str] = None,
    post_to_ledger: bool = True,
) -> StockMovement:
    if movement_type not in MOVEMENT_TYPES:
        raise BisonBookError("Unknown stock movement type.")
    if quantity == 0:
        raise BisonBookError("Quantity cannot be zero.")
    ensure_opening_movements(db, vendor)
    current = int(listing.stock_quantity or 0)
    if current + quantity < 0:
        raise BisonBookError(f"Only {current} in stock. You cannot remove {abs(quantity)}.")

    cost = unit_cost if unit_cost is not None else None
    if quantity < 0 and cost is None:
        cost = average_cost(db, listing)
    move = StockMovement(
        vendor_id=vendor.id,
        vendor_product_id=listing.id,
        movement_type=movement_type,
        quantity=int(quantity),
        unit_cost=money(cost) if cost is not None else None,
        reference=reference,
        note=note,
        created_by=created_by,
    )
    db.add(move)
    db.flush()
    if quantity > 0 and unit_cost is not None and unit_cost > 0:
        listing.unit_cost = money(unit_cost)
    _sync_listing_stock(db, listing)

    if post_to_ledger and movement_type != "sale":
        _post_movement(db, vendor, listing, move, paid_via=paid_via, created_by=created_by)
    return move


def _post_movement(db: Session, vendor: Vendor, listing: VendorProduct, move: StockMovement, *, paid_via, created_by) -> None:
    value = money(abs(move.quantity) * (move.unit_cost or 0))
    if value <= 0:
        return
    name = listing.product.name if listing.product else f"Listing {listing.id}"
    inventory = ledger.account_by_key(db, vendor, "inventory")
    if move.quantity > 0:
        if move.movement_type == "return":
            counter = ledger.account_by_key(db, vendor, "cogs")
        elif move.movement_type in {"opening", "adjust"}:
            counter = ledger.account_by_key(db, vendor, "opening_equity")
        else:
            counter = ledger.account_by_key(db, vendor, {"cash": "cash", "payable": "ap"}.get(paid_via or "", "bank"))
        lines = [(inventory, value, 0, name), (counter, 0, value, move.reference or name)]
    else:
        counter = ledger.account_by_key(db, vendor, "shrinkage" if move.movement_type == "adjust" else "cogs")
        lines = [(counter, value, 0, move.note or name), (inventory, 0, value, name)]
    ledger.post_entry(
        db, vendor,
        entry_date=move.created_at or None,
        memo=f"Stock {move.movement_type}: {name} ({move.quantity:+d})",
        lines=lines, source_type="stock", source_id=move.id, created_by=created_by,
    )


def set_stock_level(db: Session, vendor: Vendor, listing: VendorProduct, new_quantity: int, created_by: Optional[str] = None) -> None:
    """Used by the classic product form: turn an absolute stock edit into an adjust movement."""
    ensure_opening_movements(db, vendor)
    delta = int(new_quantity) - int(listing.stock_quantity or 0)
    if delta:
        record_movement(
            db, vendor, listing, movement_type="adjust", quantity=delta,
            unit_cost=listing.unit_cost if delta > 0 else None,
            reference="Stock edited on product form", created_by=created_by,
        )


def inventory_overview(db: Session, vendor: Vendor, method: str = "average") -> dict:
    ensure_opening_movements(db, vendor)
    threshold = int(get_settings(db, vendor).low_stock_threshold or 0)
    items: List[Dict] = []
    total_value = 0.0
    total_retail = 0.0
    for listing in (
        db.query(VendorProduct)
        .options(joinedload(VendorProduct.product))
        .filter(VendorProduct.vendor_id == vendor.id)
        .order_by(VendorProduct.id)
    ):
        qty = int(listing.stock_quantity or 0)
        avg = average_cost(db, listing)
        value = fifo_value(db, listing) if method == "fifo" else money(max(qty, 0) * avg)
        total_value += value
        total_retail += max(qty, 0) * (listing.price or 0)
        product = listing.product
        items.append({
            "vendor_product_id": listing.id,
            "product_id": listing.product_id,
            "name": product.name if product else f"Listing {listing.id}",
            "sku": product.sku if product else None,
            "category": product.category if product else None,
            "image_url": product.image_url if product else None,
            "price": listing.price,
            "price_mode": listing.price_mode or "fixed",
            "unit_cost": listing.unit_cost,
            "average_cost": avg,
            "stock_quantity": qty,
            "value": value,
            "is_active": bool(listing.is_active),
            "low_stock": qty <= threshold,
            "out_of_stock": qty <= 0,
        })
    return {
        "method": method,
        "low_stock_threshold": threshold,
        "items": items,
        "total_value": money(total_value),
        "total_retail_value": money(total_retail),
        "low_stock_count": sum(1 for i in items if i["low_stock"] and not i["out_of_stock"]),
        "out_of_stock_count": sum(1 for i in items if i["out_of_stock"]),
    }


def serialize_movement(move: StockMovement) -> dict:
    listing = move.vendor_product
    product = listing.product if listing else None
    return {
        "id": move.id,
        "vendor_product_id": move.vendor_product_id,
        "product_name": product.name if product else None,
        "movement_type": move.movement_type,
        "quantity": move.quantity,
        "unit_cost": move.unit_cost,
        "reference": move.reference,
        "note": move.note,
        "created_by": move.created_by,
        "created_at": move.created_at,
    }
