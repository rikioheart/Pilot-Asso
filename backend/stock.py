"""Phase 7 — Stocks physiques (goodies, matériel, supports) gérés par le Bureau."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import (db, iso, now_utc, new_id, require, require_admin,
                  log_action, notify_bureau, display_name)

router = APIRouter(prefix="/api")

MOVEMENT_DIRECTIONS = ["IN", "OUT", "ADJUST"]


class CategoryIn(BaseModel):
    name: str = Field(min_length=2)
    description: Optional[str] = None


class StockItemIn(BaseModel):
    name: str = Field(min_length=2)
    category: str
    description: Optional[str] = None
    quantity: int = 0
    alert_threshold: int = 5
    unit: str = "pièce"
    responsible_id: Optional[str] = None
    partner_id: Optional[str] = None
    professional_id: Optional[str] = None
    origin: Optional[str] = None
    location: Optional[str] = None
    unit_cost: Optional[float] = None


class StockItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    alert_threshold: Optional[int] = None
    unit: Optional[str] = None
    responsible_id: Optional[str] = None
    partner_id: Optional[str] = None
    professional_id: Optional[str] = None
    origin: Optional[str] = None
    location: Optional[str] = None
    unit_cost: Optional[float] = None
    status: Optional[str] = None


class MovementIn(BaseModel):
    direction: str
    quantity: int = Field(gt=0)
    reason: Optional[str] = None
    related_user_id: Optional[str] = None
    event_id: Optional[str] = None
    activity_id: Optional[str] = None


async def apply_movement(item: dict, direction: str, quantity: int, reason: str,
                         related_user_id: Optional[str], actor: dict) -> dict:
    delta = quantity if direction == "IN" else -quantity
    new_quantity = item["quantity"] + delta if direction != "ADJUST" else quantity
    if new_quantity < 0:
        raise HTTPException(status_code=400,
                            detail=f"Stock insuffisant : {item['quantity']} {item['unit']}(s) disponibles")
    movement = {
        "movement_id": new_id("mvt"), "item_id": item["item_id"], "item_name": item["name"],
        "direction": direction, "quantity": quantity, "reason": reason,
        "related_user_id": related_user_id,
        "related_user_name": await display_name(related_user_id) if related_user_id else None,
        "quantity_before": item["quantity"], "quantity_after": new_quantity,
        "created_by": actor["user_id"], "created_by_name": await display_name(actor["user_id"]),
        "created_at": iso(now_utc()),
    }
    await db.stock_movements.insert_one(dict(movement))
    await db.stock_items.update_one({"item_id": item["item_id"]},
                                    {"$set": {"quantity": new_quantity, "updated_at": iso(now_utc())}})
    if new_quantity <= item.get("alert_threshold", 0):
        await notify_bureau(type="STOCK_ALERT", title="Stock bas",
                            message=f"« {item['name']} » : {new_quantity} {item['unit']}(s) restant(s) "
                                    f"(seuil {item.get('alert_threshold')}).",
                            level="WARNING", resource_type="stock_item", resource_id=item["item_id"],
                            link="/stock")
    return movement


async def consume_stock(item_id: str, quantity: int, reason: str, related_user_id: str, actor: dict):
    """Déduction automatique (avantage adhérent goodie)."""
    item = await db.stock_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        return None
    return await apply_movement(item, "OUT", quantity, reason, related_user_id, actor)


@router.get("/stock/categories")
async def list_categories(admin: dict = Depends(require("stock.view"))):
    items = await db.stock_categories.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return {"items": items, "total": len(items)}


@router.post("/stock/categories")
async def create_category(payload: CategoryIn, admin: dict = Depends(require("stock.manage"))):
    if await db.stock_categories.find_one({"name": payload.name}):
        raise HTTPException(status_code=400, detail="Cette catégorie existe déjà")
    doc = {"category_id": new_id("scat"), **payload.model_dump(),
           "created_by": admin["user_id"], "created_at": iso(now_utc())}
    await db.stock_categories.insert_one(dict(doc))
    await log_action(admin, "CREATE", "stock", doc["category_id"], new_value={"name": payload.name})
    return doc


@router.get("/stock/items")
async def list_items(category: Optional[str] = None, low_only: bool = False, q: Optional[str] = None,
                     admin: dict = Depends(require("stock.view"))):
    filters = [{"status": {"$ne": "ARCHIVED"}}]
    if category:
        filters.append({"category": category})
    if q:
        filters.append({"name": {"$regex": q, "$options": "i"}})
    items = await db.stock_items.find({"$and": filters}, {"_id": 0}).sort("name", 1).to_list(500)
    for item in items:
        item["is_low"] = item["quantity"] <= item.get("alert_threshold", 0)
    if low_only:
        items = [i for i in items if i["is_low"]]
    return {"items": items, "total": len(items),
            "low_count": len([i for i in items if i["is_low"]]),
            "total_units": sum(i["quantity"] for i in items)}


@router.post("/stock/items")
async def create_item(payload: StockItemIn, admin: dict = Depends(require("stock.manage"))):
    doc = {"item_id": new_id("stk"), **payload.model_dump(), "status": "ACTIVE",
           "created_by": admin["user_id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.stock_items.insert_one(dict(doc))
    if payload.quantity:
        await apply_movement({**doc, "quantity": 0}, "IN", payload.quantity, "Stock initial", None, admin)
        await db.stock_items.update_one({"item_id": doc["item_id"]}, {"$set": {"quantity": payload.quantity}})
    await log_action(admin, "CREATE", "stock", doc["item_id"], new_value={"name": payload.name})
    return doc


@router.put("/stock/items/{item_id}")
async def update_item(item_id: str, payload: StockItemUpdate, admin: dict = Depends(require("stock.manage"))):
    item = await db.stock_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Article introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates and updates["status"] not in ("ACTIVE", "ARCHIVED"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    updates["updated_at"] = iso(now_utc())
    await db.stock_items.update_one({"item_id": item_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "stock", item_id, new_value=updates)
    return await db.stock_items.find_one({"item_id": item_id}, {"_id": 0})


@router.post("/stock/items/{item_id}/movements")
async def create_movement(item_id: str, payload: MovementIn, admin: dict = Depends(require("stock.manage"))):
    item = await db.stock_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Article introuvable")
    if payload.direction not in MOVEMENT_DIRECTIONS:
        raise HTTPException(status_code=400, detail="Type de mouvement invalide")
    movement = await apply_movement(item, payload.direction, payload.quantity,
                                    payload.reason or "Mouvement de stock",
                                    payload.related_user_id, admin)
    await log_action(admin, "MOVEMENT", "stock", item_id,
                     new_value={"direction": payload.direction, "quantity": payload.quantity})
    return movement


@router.get("/stock/movements")
async def list_movements(item_id: Optional[str] = None, limit: int = 300,
                         admin: dict = Depends(require("stock.view"))):
    query = {"item_id": item_id} if item_id else {}
    items = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"items": items, "total": len(items)}


@router.delete("/stock/items/{item_id}")
async def archive_item(item_id: str, admin: dict = Depends(require_admin)):
    res = await db.stock_items.update_one({"item_id": item_id},
                                          {"$set": {"status": "ARCHIVED", "updated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Article introuvable")
    await log_action(admin, "ARCHIVE", "stock", item_id)
    return {"ok": True}
