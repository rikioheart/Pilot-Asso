"""Annuaire et fiches professionnelles (professional_details)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from rbac import ROLE_ADMIN, ROLE_PRO
from deps import db, iso, now_utc, new_id, active_user, require, require_admin, log_action, notify

router = APIRouter(prefix="/api")

PRO_CATEGORIES = [
    "EDUCATEUR_CANIN", "COMPORTEMENTALISTE", "TOILETTEUR", "PENSION_FAMILIALE", "PET_SITTER",
    "VETERINAIRE", "OSTEOPATHE", "NATUROPATHE", "MASSEUR_CANIN", "PHOTOGRAPHE_ANIMALIER",
    "DOG_WALKER", "CONSEILLER_ALIMENTATION", "FORMATEUR", "ARTISAN_ACCESSOIRES", "AUTRE",
]


class ProDetailsIn(BaseModel):
    company_name: Optional[str] = None
    professional_category: Optional[str] = None
    secondary_categories: List[str] = []
    description: Optional[str] = None
    specialties: List[str] = []
    services: List[str] = []
    service_area: Optional[str] = None
    departments: List[str] = []
    website: Optional[str] = None
    social_links: dict = {}
    phone: Optional[str] = None
    email: Optional[str] = None
    logo: Optional[str] = None
    member_advantages: Optional[str] = None
    public_visibility: str = "MEMBERS"


class ProAdminIn(BaseModel):
    partnership_status: Optional[str] = None
    partnership_percentage: Optional[float] = None
    contract_status: Optional[str] = None
    contract_reference: Optional[str] = None
    contract_url: Optional[str] = None
    public_visibility: Optional[str] = None
    company_name: Optional[str] = None
    professional_category: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    social_links: Optional[dict] = None
    phone: Optional[str] = None
    email: Optional[str] = None


def _blank(user_id: str, profile_id: str) -> dict:
    return {
        "details_id": new_id("pro"), "user_id": user_id, "profile_id": profile_id,
        "company_name": None, "professional_category": None, "secondary_categories": [],
        "description": None, "specialties": [], "services": [], "service_area": None, "departments": [],
        "website": None, "social_links": {}, "phone": None, "email": None, "logo": None,
        "member_advantages": None, "promo_codes": [], "partnership_status": "NONE",
        "partnership_percentage": None, "contract_status": "NONE", "contract_reference": None,
        "contract_url": None, "documents": [], "public_visibility": "MEMBERS",
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }


@router.get("/professionals/meta/categories")
async def categories(user: dict = Depends(active_user)):
    return {"categories": PRO_CATEGORIES}


@router.get("/professionals/me")
async def my_details(user: dict = Depends(active_user)):
    if user["role"] not in (ROLE_PRO, ROLE_ADMIN):
        raise HTTPException(status_code=403, detail="Réservé aux professionnels")
    doc = await db.professional_details.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0, "profile_id": 1})
        doc = _blank(user["user_id"], (profile or {}).get("profile_id"))
        await db.professional_details.insert_one(dict(doc))
    return doc


@router.put("/professionals/me")
async def update_my_details(payload: ProDetailsIn, user: dict = Depends(active_user)):
    if user["role"] not in (ROLE_PRO, ROLE_ADMIN):
        raise HTTPException(status_code=403, detail="Réservé aux professionnels")
    if payload.professional_category and payload.professional_category not in PRO_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie professionnelle invalide")
    existing = await db.professional_details.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not existing:
        profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0, "profile_id": 1})
        existing = _blank(user["user_id"], (profile or {}).get("profile_id"))
        await db.professional_details.insert_one(dict(existing))
    updates = payload.model_dump()
    updates["updated_at"] = iso(now_utc())
    await db.professional_details.update_one({"user_id": user["user_id"]}, {"$set": updates})
    await log_action(user, "UPDATE", "professionals", user["user_id"],
                    old_value={k: existing.get(k) for k in updates}, new_value=updates)
    return await db.professional_details.find_one({"user_id": user["user_id"]}, {"_id": 0})


@router.get("/professionals")
async def directory(q: Optional[str] = None, category: Optional[str] = None, department: Optional[str] = None,
                    specialty: Optional[str] = None, limit: int = 100,
                    user: dict = Depends(require("members.view"))):
    filters = []
    if user["role"] != ROLE_ADMIN:
        filters.append({"public_visibility": {"$in": ["PROFESSIONALS", "MEMBERS", "PUBLIC"]}})
    if category:
        filters.append({"$or": [{"professional_category": category}, {"secondary_categories": category}]})
    if department:
        filters.append({"departments": department})
    if specialty:
        filters.append({"specialties": {"$regex": specialty, "$options": "i"}})
    if q:
        filters.append({"$or": [{"company_name": {"$regex": q, "$options": "i"}},
                                {"description": {"$regex": q, "$options": "i"}},
                                {"service_area": {"$regex": q, "$options": "i"}}]})
    query = {"$and": filters} if filters else {}
    items = await db.professional_details.find(query, {"_id": 0}).limit(limit).to_list(limit)
    uids = [i["user_id"] for i in items]
    users = {u["user_id"]: u async for u in db.users.find(
        {"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "status": 1, "access_level": 1})}
    profiles = {p["user_id"]: p async for p in db.profiles.find(
        {"user_id": {"$in": uids}}, {"_id": 0})}
    results = []
    for it in items:
        u = users.get(it["user_id"])
        if not u or (u["status"] != "ACTIVE" and user["role"] != ROLE_ADMIN):
            continue
        p = profiles.get(it["user_id"], {})
        results.append({**it, "display_name": p.get("display_name"), "city": p.get("city"),
                        "department": p.get("department"), "avatar": p.get("avatar"),
                        "involvement_level": u.get("access_level"), "member_status": u.get("status")})
    if q:
        ql = q.lower()
        results = [r for r in results if ql in ((r.get("display_name") or "") + (r.get("company_name") or "")
                                                + (r.get("description") or "") + " ".join(r.get("specialties", []))).lower()] \
            or results
    return {"items": results, "total": len(results), "categories": PRO_CATEGORIES}


@router.get("/professionals/{user_id}")
async def get_professional(user_id: str, user: dict = Depends(require("members.view"))):
    doc = await db.professional_details.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Fiche professionnelle introuvable")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if user["role"] != ROLE_ADMIN:
        if target["status"] != "ACTIVE" or doc.get("public_visibility") in ("INTERNAL_ONLY", "BUREAU"):
            raise HTTPException(status_code=403, detail="Fiche non visible")
        doc.pop("partnership_percentage", None)
        doc.pop("contract_reference", None)
        doc.pop("contract_url", None)
        doc.pop("documents", None)
        doc.pop("promo_codes", None)
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    projects = await db.project_teams.find({"member_id": user_id, "status": "ACTIVE"}, {"_id": 0}).to_list(50)
    pids = [p["project_id"] for p in projects]
    project_titles = await db.projects.find({"project_id": {"$in": pids}, "status": {"$ne": "ARCHIVED"}},
                                            {"_id": 0, "project_id": 1, "title": 1, "status": 1}).to_list(50)
    return {"details": doc, "profile": profile, "access_level": target["access_level"],
            "status": target["status"], "projects": project_titles}


PUBLIC_CARD_FIELDS = ["company_name", "professional_category", "secondary_categories", "description",
                      "specialties", "services", "service_area", "departments", "website", "social_links",
                      "phone", "email", "logo"]


@router.get("/public/professionals/{user_id}")
async def public_business_card(user_id: str):
    """Carte de visite numérique : accessible sans connexion, champs publics uniquement."""
    doc = await db.professional_details.find_one({"user_id": user_id}, {"_id": 0})
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "status": 1, "role": 1})
    if not doc or not target or target["status"] != "ACTIVE" or target["role"] not in (ROLE_PRO, ROLE_ADMIN):
        raise HTTPException(status_code=404, detail="Carte de visite introuvable")
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0, "display_name": 1, "city": 1,
                                                                 "department": 1, "avatar": 1})
    card = {k: doc.get(k) for k in PUBLIC_CARD_FIELDS}
    card["has_logo"] = bool(doc.get("logo"))
    card.pop("logo", None)
    return {**card, "user_id": user_id, "display_name": (profile or {}).get("display_name"),
            "city": (profile or {}).get("city"), "department": (profile or {}).get("department"),
            "has_avatar": bool((profile or {}).get("avatar"))}


@router.get("/public/professionals/{user_id}/image")
async def public_business_card_image(user_id: str, kind: str = "logo"):
    from storage import get_object
    from fastapi import Response
    import httpx
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "status": 1})
    if not target or target["status"] != "ACTIVE":
        raise HTTPException(status_code=404, detail="Image introuvable")
    if kind == "avatar":
        src = await db.profiles.find_one({"user_id": user_id}, {"_id": 0, "avatar": 1})
        file_id = (src or {}).get("avatar")
    else:
        src = await db.professional_details.find_one({"user_id": user_id}, {"_id": 0, "logo": 1})
        file_id = (src or {}).get("logo")
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0}) if file_id else None
    if not record:
        raise HTTPException(status_code=404, detail="Image introuvable")
    try:
        data, content_type = await get_object(record["storage_path"])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Image momentanément indisponible")
    return Response(content=data, media_type=record.get("content_type") or content_type,
                    headers={"Cache-Control": "public, max-age=3600"})


@router.put("/professionals/{user_id}")
async def admin_update_professional(user_id: str, payload: ProAdminIn, admin: dict = Depends(require_admin)):
    existing = await db.professional_details.find_one({"user_id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Fiche professionnelle introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "partnership_percentage" in updates and not (0 <= updates["partnership_percentage"] <= 100):
        raise HTTPException(status_code=400, detail="Le pourcentage doit être compris entre 0 et 100")
    updates["updated_at"] = iso(now_utc())
    await db.professional_details.update_one({"user_id": user_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "professionals", user_id,
                    old_value={k: existing.get(k) for k in updates}, new_value=updates)
    await notify(user_id, type="PARTNERSHIP_UPDATED", title="Votre partenariat a été mis à jour",
                 message="Le Bureau a modifié les informations de partenariat de votre fiche.",
                 level="INFO", resource_type="professional", resource_id=user_id, link="/profile")
    return await db.professional_details.find_one({"user_id": user_id}, {"_id": 0})
