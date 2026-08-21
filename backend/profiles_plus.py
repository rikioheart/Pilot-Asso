"""Profils enrichis : catégories d'adhésion, espace professionnel, préférences, accessibilité, animation."""
from datetime import timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN, ROLE_PRO, ROLE_MEMBER
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, display_name)
from content import manager_user, is_manager

router = APIRouter(prefix="/api")

MEMBER_CATEGORIES = {
    "PROFESSIONNEL": "Professionnel", "REPRESENTANT_PRO": "Représentant professionnel",
    "BIENFAITEUR": "Bienfaiteur", "PARTICULIER": "Particulier", "BENEVOLE": "Bénévole",
    "APPRENANT": "Apprenant", "MEMBRE_SOUTIEN": "Membre soutien",
}
PRO_CATEGORIES = ["PROFESSIONNEL", "REPRESENTANT_PRO", "BIENFAITEUR"]
FONTS = ["DEFAULT", "DYSLEXIA", "SERIF"]
CONTRASTS = ["NORMAL", "HIGH", "SOFT"]
TEXT_SIZES = ["SMALL", "NORMAL", "LARGE", "XLARGE"]
SPACINGS = ["NORMAL", "COMFORTABLE", "WIDE"]
MODULES = ["feed", "engagement", "tasks", "activities", "events", "loyalty", "advantages",
           "library", "formations", "blog", "priorities", "exports", "statistics", "finance"]


class ProSpace(BaseModel):
    company_name: Optional[str] = None
    siret: Optional[str] = None
    specialties: Optional[List[str]] = None
    formations: Optional[List[str]] = None
    promo_code: Optional[str] = None
    advantage_note: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    public_summary: Optional[str] = None
    document_file_ids: Optional[List[str]] = None
    document_links: Optional[List[str]] = None


class Accessibility(BaseModel):
    font: Optional[str] = None
    text_size: Optional[str] = None
    spacing: Optional[str] = None
    contrast: Optional[str] = None
    focus_mode: Optional[bool] = None
    reduce_motion: Optional[bool] = None


class Preferences(BaseModel):
    hidden_modules: Optional[List[str]] = None
    pinned_modules: Optional[List[str]] = None


class FunctionDescriptionIn(BaseModel):
    function_description: str = Field(min_length=5, max_length=600)


def default_accessibility() -> dict:
    return {"font": "DEFAULT", "text_size": "NORMAL", "spacing": "NORMAL",
            "contrast": "NORMAL", "focus_mode": False, "reduce_motion": False}


@router.get("/profiles/meta")
async def profiles_meta(user: dict = Depends(active_user)):
    return {"member_categories": MEMBER_CATEGORIES, "pro_categories": PRO_CATEGORIES,
            "fonts": FONTS, "contrasts": CONTRASTS, "text_sizes": TEXT_SIZES,
            "spacings": SPACINGS, "modules": MODULES}


@router.put("/profiles/me/pro-space")
async def update_pro_space(payload: ProSpace, user: dict = Depends(active_user)):
    if user["role"] not in (ROLE_PRO, ROLE_ADMIN):
        raise HTTPException(status_code=403, detail="Espace réservé aux professionnels et partenaires")
    updates = {f"pro_space.{k}": v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune information fournie")
    if payload.website_url and not payload.website_url.startswith("http"):
        raise HTTPException(status_code=400, detail="Le lien du site doit commencer par http")
    updates["updated_at"] = iso(now_utc())
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": updates})
    await log_action(user, "UPDATE", "profiles", user["user_id"], new_value={"pro_space": True})
    return await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})


@router.put("/profiles/me/preferences")
async def update_preferences(payload: Preferences, user: dict = Depends(active_user)):
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="Aucune préférence fournie")
    for key in ("hidden_modules", "pinned_modules"):
        bad = [m for m in (data.get(key) or []) if m not in MODULES]
        if bad:
            raise HTTPException(status_code=400, detail=f"Module inconnu : {', '.join(bad)}")
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"preferences": data, "updated_at": iso(now_utc())}})
    return {"preferences": data}


@router.put("/profiles/me/accessibility")
async def update_accessibility(payload: Accessibility, user: dict = Depends(active_user)):
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="Aucune préférence fournie")
    checks = {"font": FONTS, "contrast": CONTRASTS, "text_size": TEXT_SIZES, "spacing": SPACINGS}
    for key, allowed in checks.items():
        if key in data and data[key] not in allowed:
            raise HTTPException(status_code=400, detail=f"Valeur invalide pour {key}")
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0, "accessibility": 1})
    merged = {**default_accessibility(), **((profile or {}).get("accessibility") or {}), **data}
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"accessibility": merged, "updated_at": iso(now_utc())}})
    return {"accessibility": merged}


@router.put("/profiles/me/function-description")
async def submit_function_description(payload: FunctionDescriptionIn, user: dict = Depends(active_user)):
    manager = await is_manager(user)
    status = "APPROVED" if manager else "PENDING"
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": {
        "function_description": payload.function_description,
        "function_description_status": status,
        "function_description_comment": None, "updated_at": iso(now_utc())}})
    await log_action(user, "UPDATE", "profiles", user["user_id"], new_value={"function_description": status})
    if not manager:
        await notify_bureau(type="FUNCTION_DESCRIPTION", title="Description de fonction à valider",
                            message=f"{await display_name(user['user_id'])} propose une description de ses missions.",
                            level="ACTION", resource_type="profile", resource_id=user["user_id"],
                            link="/admin/members")
    return {"function_description": payload.function_description, "status": status}


@router.put("/members/{user_id}/function-description")
async def review_function_description(user_id: str, body: dict, admin: dict = Depends(manager_user)):
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    decision = body.get("decision")
    if decision not in ("APPROVE", "REJECT", "EDIT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    updates = {"updated_at": iso(now_utc()), "function_description_comment": body.get("comment")}
    if decision == "EDIT":
        if not body.get("function_description"):
            raise HTTPException(status_code=400, detail="Description manquante")
        updates["function_description"] = body["function_description"]
        updates["function_description_status"] = "APPROVED"
    else:
        updates["function_description_status"] = "APPROVED" if decision == "APPROVE" else "REJECTED"
    await db.profiles.update_one({"user_id": user_id}, {"$set": updates})
    await log_action(admin, "REVIEW", "profiles", user_id,
                     new_value={"function_description_status": updates["function_description_status"]})
    await notify(user_id, type="FUNCTION_DESCRIPTION_REVIEWED",
                 title="Description validée" if updates["function_description_status"] == "APPROVED"
                 else "Description à revoir",
                 message=body.get("comment") or "Le Bureau a examiné votre description de fonction.",
                 level="SUCCESS" if updates["function_description_status"] == "APPROVED" else "WARNING",
                 link="/profile")
    return await db.profiles.find_one({"user_id": user_id}, {"_id": 0})


@router.put("/members/{user_id}/category")
async def set_member_category(user_id: str, body: dict, admin: dict = Depends(require("users.manage"))):
    category = body.get("member_category")
    if category not in MEMBER_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie d'adhésion invalide")
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    old = profile.get("member_category")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    updates = {"member_category": category, "updated_at": iso(now_utc())}
    await db.profiles.update_one({"user_id": user_id}, {"$set": updates})
    new_role = user["role"]
    if category in PRO_CATEGORIES and user["role"] == ROLE_MEMBER:
        new_role = ROLE_PRO
        await db.users.update_one({"user_id": user_id},
                                  {"$set": {"role": ROLE_PRO, "updated_at": iso(now_utc())}})
    await log_action(admin, "UPDATE", "members", user_id,
                     old_value={"member_category": old, "role": user["role"]},
                     new_value={"member_category": category, "role": new_role})
    await notify(user_id, type="CATEGORY_UPDATED", title="Votre adhésion a été mise à jour",
                 message=f"Votre catégorie est désormais : {MEMBER_CATEGORIES[category]}. "
                         "Les nouveaux accès seront actifs à votre prochaine connexion.",
                 level="INFO", link="/profile")
    return {"member_category": category, "role": new_role,
             "appears_in_directory": category in PRO_CATEGORIES}


@router.get("/animation-review")
async def animation_review(admin: dict = Depends(require("users.manage"))):
    cutoff = iso(now_utc() - timedelta(days=30))
    inactive, incomplete, no_guide = [], [], []
    fields = ("first_name", "last_name", "phone", "city", "department", "bio", "avatar")
    async for user in db.users.find({"status": "ACTIVE"}, {"_id": 0}):
        profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
        card = {"user_id": user["user_id"], "email": user["email"], "role": user["role"],
                "display_name": profile.get("display_name") or user["email"],
                "last_login": user.get("last_login"),
                "member_category": profile.get("member_category")}
        if not user.get("last_login") or user["last_login"] < cutoff:
            inactive.append(card)
        missing = [f for f in fields if not profile.get(f)]
        if missing:
            incomplete.append({**card, "missing": missing,
                               "percent": round((len(fields) - len(missing)) / len(fields) * 100)})
        if not profile.get("onboarding_done"):
            no_guide.append(card)
    return {"inactive": inactive, "incomplete": incomplete, "guide_not_seen": no_guide,
            "totals": {"inactive": len(inactive), "incomplete": len(incomplete),
                       "guide_not_seen": len(no_guide)}}


@router.post("/members/{user_id}/nudge")
async def nudge_member(user_id: str, body: dict, admin: dict = Depends(require("users.manage"))):
    if not await db.users.find_one({"user_id": user_id}):
        raise HTTPException(status_code=404, detail="Membre introuvable")
    message = (body.get("message") or "").strip()
    if len(message) < 10:
        raise HTTPException(status_code=400, detail="Écrivez un message d'encouragement (10 caractères minimum)")
    await notify(user_id, type="GENTLE_NUDGE", title="Un petit mot du Bureau",
                 message=message, level="INFO", link="/profile")
    await log_action(admin, "NUDGE", "members", user_id)
    return {"ok": True}


# ---------------------------------------------------------------- Demandes de participation
@router.get("/join-requests")
async def list_join_requests(status: Optional[str] = None, user: dict = Depends(active_user)):
    manager = await is_manager(user)
    query = {} if manager else {"user_id": user["user_id"]}
    if status:
        query["status"] = status
    items = await db.join_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"items": items, "total": len(items), "is_manager": manager}


@router.post("/join-requests")
async def create_join_request(body: dict, user: dict = Depends(active_user)):
    kind = body.get("kind")
    if kind not in ("PROJECT", "TASK", "HELP_OFFER"):
        raise HTTPException(status_code=400, detail="Type de demande invalide")
    target_id = body.get("target_id")
    title = None
    if kind == "PROJECT":
        target = await db.projects.find_one({"project_id": target_id}, {"_id": 0, "title": 1})
        if not target:
            raise HTTPException(status_code=404, detail="Projet introuvable")
        title = target["title"]
    elif kind == "TASK":
        target = await db.tasks.find_one({"task_id": target_id}, {"_id": 0, "title": 1})
        if not target:
            raise HTTPException(status_code=404, detail="Tâche introuvable")
        title = target["title"]
    if await db.join_requests.find_one({"user_id": user["user_id"], "kind": kind,
                                        "target_id": target_id, "status": "PENDING"}):
        raise HTTPException(status_code=400, detail="Vous avez déjà une demande en attente pour cet élément")
    doc = {"request_id": new_id("jrq"), "kind": kind, "target_id": target_id, "target_title": title,
           "message": body.get("message"), "skills": body.get("skills"), "status": "PENDING",
           "user_id": user["user_id"], "user_name": await display_name(user["user_id"]),
           "review_comment": None, "reviewed_by": None,
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.join_requests.insert_one(dict(doc))
    await log_action(user, "CREATE", "join_requests", doc["request_id"], new_value={"kind": kind})
    labels = {"PROJECT": "rejoindre un projet", "TASK": "prendre une tâche", "HELP_OFFER": "proposer son aide"}
    await notify_bureau(type="JOIN_REQUEST", title="Nouvelle proposition d'un adhérent",
                        message=f"{doc['user_name']} souhaite {labels[kind]}"
                                + (f" : « {title} »" if title else "."),
                        level="ACTION", resource_type="join_request", resource_id=doc["request_id"],
                        link="/admin/members")
    return doc


@router.post("/join-requests/{request_id}/review")
async def review_join_request(request_id: str, body: dict, admin: dict = Depends(manager_user)):
    request = await db.join_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    decision = body.get("decision")
    if decision not in ("ACCEPT", "REFUSE"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    status = "ACCEPTED" if decision == "ACCEPT" else "REFUSED"
    await db.join_requests.update_one({"request_id": request_id}, {"$set": {
        "status": status, "review_comment": body.get("comment"), "reviewed_by": admin["user_id"],
        "updated_at": iso(now_utc())}})
    if status == "ACCEPTED" and request["kind"] == "TASK":
        await db.tasks.update_one({"task_id": request["target_id"]},
                                  {"$set": {"assigned_user_id": request["user_id"],
                                            "updated_at": iso(now_utc())}})
    await log_action(admin, "REVIEW", "join_requests", request_id, new_value={"status": status})
    await notify(request["user_id"], type="JOIN_REQUEST_REVIEWED",
                 title="Proposition acceptée" if status == "ACCEPTED" else "Proposition non retenue",
                 message=body.get("comment") or
                 ("Merci ! Le Bureau vous a intégré." if status == "ACCEPTED"
                  else "Le Bureau vous répondra prochainement pour une autre mission."),
                 level="SUCCESS" if status == "ACCEPTED" else "INFO", link="/tasks")
    return await db.join_requests.find_one({"request_id": request_id}, {"_id": 0})


@router.get("/me/space")
async def my_space(user: dict = Depends(active_user)):
    """Récapitulatif personnel : participations, inscriptions, préférences."""
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    today = iso(now_utc())[:10]
    activities, events = [], []
    async for p in db.participations.find({"user_id": user["user_id"]}, {"_id": 0}).limit(200):
        if p.get("activity_id"):
            item = await db.activities.find_one({"activity_id": p["activity_id"]},
                                                {"_id": 0, "title": 1, "date": 1, "location": 1})
            if item:
                activities.append({**item, "upcoming": (item.get("date") or "") >= today,
                                   "status": p.get("attendance_status")})
        elif p.get("event_id"):
            item = await db.events.find_one({"event_id": p["event_id"]},
                                            {"_id": 0, "title": 1, "start_date": 1, "location": 1})
            if item:
                events.append({**item, "upcoming": (item.get("start_date") or "")[:10] >= today,
                               "status": p.get("attendance_status")})
    formations = []
    async for r in db.formation_registrations.find({"user_id": user["user_id"]}, {"_id": 0}).limit(100):
        item = await db.formations.find_one({"formation_id": r["formation_id"]},
                                            {"_id": 0, "title": 1, "date": 1, "format": 1})
        if item:
            formations.append(item)
    return {
        "activities": sorted(activities, key=lambda x: x.get("date") or "", reverse=True),
        "events": sorted(events, key=lambda x: x.get("start_date") or "", reverse=True),
        "formations": formations,
        "join_requests": await db.join_requests.find({"user_id": user["user_id"]}, {"_id": 0})
        .sort("created_at", -1).to_list(50),
        "advantages_claimed": await db.advantage_claims.count_documents({"user_id": user["user_id"]}),
        "preferences": profile.get("preferences") or {},
        "accessibility": profile.get("accessibility") or default_accessibility(),
        "member_category": profile.get("member_category"),
        "function_description": profile.get("function_description"),
        "function_description_status": profile.get("function_description_status"),
        "pro_space": profile.get("pro_space") or {},
    }
