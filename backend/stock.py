"""Phase 7 — Stocks physiques (goodies, matériel, supports) gérés par le Bureau."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import (db, iso, now_utc, new_id, require, require_admin,
                  log_action, notify_bureau, display_name)

router = APIRouter(prefix="/api")

MOVEMENT_DIRECTIONS = ["IN", "OUT", "ADJUST"]
PAYMENT_METHODS = ["ESPECES", "VIREMENT", "CARTE", "DON", "AUTRE"]
PAYMENT_LABELS = {"ESPECES": "Espèces", "VIREMENT": "Virement", "CARTE": "Carte",
                  "DON": "Don", "AUTRE": "Autre"}
DEFAULT_CATEGORIES = [
    ("Mastication", "Articles de mastication"), ("Jeux", "Jeux et jouets"),
    ("Olfaction", "Matériel d'olfaction"), ("Sport physique", "Matériel sportif"),
    ("Événement", "Matériel d'événement"), ("Produits partenaires", "Produits de partenaires"),
    ("Document ou flyer", "Supports imprimés"), ("Autre", "Divers"),
]


async def ensure_default_categories():
    for name, description in DEFAULT_CATEGORIES:
        if not await db.stock_categories.find_one({"name": name}):
            await db.stock_categories.insert_one({
                "category_id": new_id("scat"), "name": name, "description": description,
                "is_default": True, "created_by": None, "created_at": iso(now_utc())})


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
    project_id: Optional[str] = None
    task_id: Optional[str] = None


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
    project_id: Optional[str] = None
    task_id: Optional[str] = None


class MovementIn(BaseModel):
    direction: str
    quantity: int = Field(gt=0)
    reason: Optional[str] = None
    related_user_id: Optional[str] = None
    event_id: Optional[str] = None
    activity_id: Optional[str] = None
    payment_method: Optional[str] = None
    date: Optional[str] = None
    amount: Optional[float] = None


async def apply_movement(item: dict, direction: str, quantity: int, reason: str,
                         related_user_id: Optional[str], actor: dict,
                         payment_method: Optional[str] = None, date: Optional[str] = None,
                         amount: Optional[float] = None) -> dict:
    delta = quantity if direction == "IN" else -quantity
    new_quantity = item["quantity"] + delta if direction != "ADJUST" else quantity
    if new_quantity < 0:
        raise HTTPException(status_code=400,
                            detail=f"Stock insuffisant : {item['quantity']} {item['unit']}(s) disponibles")
    movement = {
        "movement_id": new_id("mvt"), "item_id": item["item_id"], "item_name": item["name"],
        "direction": direction, "quantity": quantity, "reason": reason,
        "payment_method": payment_method, "payment_label": PAYMENT_LABELS.get(payment_method),
        "date": date or iso(now_utc())[:10],
        "amount": amount if amount is not None
        else (round((item.get("unit_cost") or 0) * quantity, 2) or None),
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


@router.get("/stock/meta")
async def stock_meta(user: dict = Depends(require("stock.view"))):
    await ensure_default_categories()
    categories = await db.stock_categories.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return {"categories": categories, "payment_methods": PAYMENT_METHODS,
            "payment_labels": PAYMENT_LABELS, "directions": MOVEMENT_DIRECTIONS}


@router.get("/stock/categories")
async def list_categories(admin: dict = Depends(require("stock.view"))):
    await ensure_default_categories()
    items = await db.stock_categories.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    for cat in items:
        cat["items_count"] = await db.stock_items.count_documents(
            {"category": cat["name"], "status": {"$ne": "ARCHIVED"}})
    return {"items": items, "total": len(items)}


@router.put("/stock/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryIn,
                          admin: dict = Depends(require("stock.manage"))):
    category = await db.stock_categories.find_one({"category_id": category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    if payload.name != category["name"] and await db.stock_categories.find_one({"name": payload.name}):
        raise HTTPException(status_code=400, detail="Cette catégorie existe déjà")
    await db.stock_categories.update_one({"category_id": category_id},
                                         {"$set": {"name": payload.name,
                                                   "description": payload.description,
                                                   "updated_at": iso(now_utc())}})
    # Répercussion immédiate sur tous les articles concernés.
    await db.stock_items.update_many({"category": category["name"]},
                                     {"$set": {"category": payload.name,
                                               "updated_at": iso(now_utc())}})
    await log_action(admin, "UPDATE", "stock", category_id,
                     old_value={"name": category["name"]}, new_value={"name": payload.name})
    return await db.stock_categories.find_one({"category_id": category_id}, {"_id": 0})


@router.get("/stock/finance-summary")
async def stock_finance_summary(admin: dict = Depends(require("stock.view"))):
    """Récapitulatif financier des mouvements de stock par mode de paiement."""
    movements = await db.stock_movements.find({}, {"_id": 0}).to_list(3000)
    by_method: dict = {}
    for m in movements:
        method = m.get("payment_method") or "AUTRE"
        bucket = by_method.setdefault(method, {"count": 0, "amount": 0.0, "in": 0, "out": 0})
        bucket["count"] += 1
        bucket["amount"] += float(m.get("amount") or 0)
        if m.get("direction") == "IN":
            bucket["in"] += m.get("quantity", 0)
        elif m.get("direction") == "OUT":
            bucket["out"] += m.get("quantity", 0)
    items = await db.stock_items.find({"status": {"$ne": "ARCHIVED"}}, {"_id": 0}).to_list(500)
    return {
        "by_method": [{"method": k, "label": PAYMENT_LABELS.get(k, k), **v}
                      for k, v in sorted(by_method.items(), key=lambda x: -x[1]["amount"])],
        "total_amount": round(sum(v["amount"] for v in by_method.values()), 2),
        "movements_count": len(movements),
        "stock_value": round(sum((i.get("unit_cost") or 0) * i["quantity"] for i in items), 2),
    }


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
        if item.get("project_id"):
            project = await db.projects.find_one({"project_id": item["project_id"]},
                                                 {"_id": 0, "title": 1})
            item["project_title"] = (project or {}).get("title")
        if item.get("task_id"):
            task = await db.tasks.find_one({"task_id": item["task_id"]}, {"_id": 0, "title": 1})
            item["task_title"] = (task or {}).get("title")
    if low_only:
        items = [i for i in items if i["is_low"]]
    return {"items": items, "total": len(items),
            "low_count": len([i for i in items if i["is_low"]]),
            "total_units": sum(i["quantity"] for i in items)}


@router.get("/stock/linked")
async def linked_items(project_id: Optional[str] = None, task_id: Optional[str] = None,
                       user: dict = Depends(require("stock.view"))):
    """Articles d'inventaire liés à un projet ou à une tâche (vue depuis la fiche concernée)."""
    query = {"status": {"$ne": "ARCHIVED"}}
    if project_id:
        query["project_id"] = project_id
    elif task_id:
        query["task_id"] = task_id
    else:
        raise HTTPException(status_code=400, detail="Indiquez un projet ou une tâche")
    items = await db.stock_items.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    return {"items": items, "total": len(items)}


@router.post("/stock/items")
async def create_item(payload: StockItemIn, admin: dict = Depends(require("stock.manage"))):
    await ensure_default_categories()
    if not await db.stock_categories.find_one({"name": payload.category}):
        raise HTTPException(status_code=400, detail="Catégorie inconnue : créez-la dans les paramètres")
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
    if payload.payment_method and payload.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Mode de paiement invalide")
    movement = await apply_movement(item, payload.direction, payload.quantity,
                                    payload.reason or "Mouvement de stock",
                                    payload.related_user_id, admin,
                                    payment_method=payload.payment_method,
                                    date=payload.date, amount=payload.amount)
    await log_action(admin, "MOVEMENT", "stock", item_id,
                     new_value={"direction": payload.direction, "quantity": payload.quantity,
                                "paiement": PAYMENT_LABELS.get(payload.payment_method),
                                "date": movement["date"]})
    return movement


@router.get("/stock/movements")
async def list_movements(item_id: Optional[str] = None, limit: int = 300,
                         admin: dict = Depends(require("stock.view"))):
    query = {"item_id": item_id} if item_id else {}
    items = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for m in items:
        m["payment_label"] = PAYMENT_LABELS.get(m.get("payment_method"))
    return {"items": items, "total": len(items)}


@router.delete("/stock/items/{item_id}")
async def delete_item(item_id: str, reason: Optional[str] = None, hard: bool = False,
                      admin: dict = Depends(require_admin)):
    item = await db.stock_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Article introuvable")
    if hard:
        await db.stock_items.delete_one({"item_id": item_id})
        await db.stock_movements.delete_many({"item_id": item_id})
        await log_action(admin, "DELETE", "stock", item_id,
                         old_value={"nom": item["name"], "quantité": item["quantity"]},
                         new_value={"motif": reason, "definitif": True})
        return {"ok": True, "message": f"« {item['name']} » supprimé définitivement."}
    await db.stock_items.update_one({"item_id": item_id},
                                    {"$set": {"status": "ARCHIVED", "archive_reason": reason,
                                              "updated_at": iso(now_utc())}})
    await log_action(admin, "ARCHIVE", "stock", item_id,
                     old_value={"nom": item["name"]}, new_value={"motif": reason})
    return {"ok": True, "message": f"« {item['name']} » archivé, récupérable."}
