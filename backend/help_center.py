"""Prompt 6 — Fiches de poste, guides d'utilisation, espace aide et suivi des professionnels."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin, log_action,
                  display_name, notify, notify_bureau)
from content import is_manager

router = APIRouter(prefix="/api")

ROLE_SCOPES = ["BUREAU", "PROFESSIONNEL", "PARTICULIER", "BENEVOLE", "APPRENANT"]
ROLE_SCOPE_LABELS = {"BUREAU": "Bureau", "PROFESSIONNEL": "Professionnel",
                     "PARTICULIER": "Particulier", "BENEVOLE": "Bénévole",
                     "APPRENANT": "Apprenant"}
MODULES = ["ACCUEIL", "PROJETS", "TACHES", "ACTIVITES", "EVENEMENTS", "CHIENS", "ENGAGEMENT",
           "FINANCES", "STOCKS", "DOCUMENTS", "PARTENAIRES", "TERRAIN", "COMMUNICATION",
           "FORMULAIRES", "PROFIL", "AUTRE"]
MODULE_LABELS = {"ACCUEIL": "Accueil", "PROJETS": "Projets", "TACHES": "Tâches",
                 "ACTIVITES": "Activités", "EVENEMENTS": "Événements", "CHIENS": "Chiens",
                 "ENGAGEMENT": "Engagement", "FINANCES": "Finances", "STOCKS": "Stocks",
                 "DOCUMENTS": "Documents", "PARTENAIRES": "Partenaires", "TERRAIN": "Terrain",
                 "COMMUNICATION": "Communication", "FORMULAIRES": "Formulaires",
                 "PROFIL": "Mon profil", "AUTRE": "Autre"}
VISIBILITIES = ["ALL", "PRO_BUREAU", "BUREAU"]
VISIBILITY_LABELS = {"ALL": "Tous les membres", "PRO_BUREAU": "Professionnels + Bureau",
                     "BUREAU": "Bureau seul"}
GUIDE_STATUSES = ["PUBLISHED", "PENDING", "REFUSED", "DRAFT"]
GUIDE_STATUS_LABELS = {"PUBLISHED": "Publié", "PENDING": "En attente de validation",
                       "REFUSED": "Refusé", "DRAFT": "Brouillon"}
JOB_SHEET_CATEGORY = "FICHE_DE_POSTE"


class JobSheetIn(BaseModel):
    member_id: str
    role_title: str = Field(min_length=2)
    responsibilities: str = Field(min_length=3)
    daily_actions: Optional[str] = None
    modules: List[str] = []
    visibility: str = "PRO_BUREAU"
    file_id: Optional[str] = None
    notes: Optional[str] = None


class JobSheetUpdate(BaseModel):
    role_title: Optional[str] = None
    responsibilities: Optional[str] = None
    daily_actions: Optional[str] = None
    modules: Optional[List[str]] = None
    visibility: Optional[str] = None
    file_id: Optional[str] = None
    notes: Optional[str] = None


class GuideIn(BaseModel):
    title: str = Field(min_length=3)
    module: str = "AUTRE"
    role_scopes: List[str] = ["PARTICULIER"]
    summary: Optional[str] = None
    content: str = Field(min_length=10, max_length=3_000_000)
    visibility: str = "ALL"
    activity_id: Optional[str] = None


class GuideUpdate(BaseModel):
    title: Optional[str] = None
    module: Optional[str] = None
    role_scopes: Optional[List[str]] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None


class GuideReviewIn(BaseModel):
    decision: str
    visibility: str = "ALL"
    comment: Optional[str] = None


class ProReviewIn(BaseModel):
    professional_id: str
    observations: str = Field(min_length=3)
    strengths: Optional[str] = None
    improvements: Optional[str] = None
    context: Optional[str] = None


def visible_filter(user: dict) -> dict:
    if user["role"] == ROLE_ADMIN:
        return {}
    if user["role"] == ROLE_PRO:
        return {"visibility": {"$in": ["ALL", "PRO_BUREAU"]}}
    return {"visibility": "ALL"}


# ---------------------------------------------------------------- Méta
@router.get("/help/meta")
async def help_meta(user: dict = Depends(active_user)):
    return {"role_scopes": ROLE_SCOPES, "role_scope_labels": ROLE_SCOPE_LABELS,
            "modules": MODULES, "module_labels": MODULE_LABELS,
            "visibilities": VISIBILITIES, "visibility_labels": VISIBILITY_LABELS,
            "guide_statuses": GUIDE_STATUSES, "guide_status_labels": GUIDE_STATUS_LABELS,
            "is_manager": await is_manager(user), "can_propose": user["role"] in (ROLE_PRO, ROLE_ADMIN)}


# ---------------------------------------------------------------- Fiches de poste
@router.get("/job-sheets")
async def list_job_sheets(member_id: Optional[str] = None, q: Optional[str] = None,
                          user: dict = Depends(active_user)):
    filters = [{"category": JOB_SHEET_CATEGORY}, {"status": {"$ne": "ARCHIVE"}}]
    scope = visible_filter(user)
    if scope:
        filters.append(scope)
    if member_id:
        filters.append({"member_id": member_id})
    if q:
        filters.append({"$or": [{"title": {"$regex": q, "$options": "i"}},
                                {"role_title": {"$regex": q, "$options": "i"}},
                                {"responsibilities": {"$regex": q, "$options": "i"}}]})
    items = await db.documents.find({"$and": filters}, {"_id": 0}).sort("role_title", 1).to_list(200)
    for item in items:
        item["member_name"] = await display_name(item.get("member_id")) if item.get("member_id") else None
        item["visibility_label"] = VISIBILITY_LABELS.get(item.get("visibility"), "Bureau seul")
        item["module_labels"] = [MODULE_LABELS.get(m, m) for m in (item.get("modules") or [])]
    return {"items": items, "total": len(items), "is_manager": await is_manager(user)}


@router.post("/job-sheets")
async def create_job_sheet(payload: JobSheetIn, admin: dict = Depends(require_admin)):
    if payload.visibility not in VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    if not await db.users.find_one({"user_id": payload.member_id}):
        raise HTTPException(status_code=404, detail="Membre introuvable")
    doc = {
        "document_id": new_id("doc"), "category": JOB_SHEET_CATEGORY, "proof_type": "AUTRE",
        "title": f"Fiche de poste — {payload.role_title}", "status": "SIGNE",
        "date": iso(now_utc())[:10], "shared_with_user_ids": [payload.member_id],
        "reminder_sent": False, **payload.model_dump(),
        "created_by": admin["user_id"], "created_by_name": await display_name(admin["user_id"]),
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.documents.insert_one(dict(doc))
    await log_action(admin, "CREATE", "documents", doc["document_id"],
                     new_value={"fiche_de_poste": payload.role_title})
    await notify(payload.member_id, type="DOCUMENT_SHARED", title="Votre fiche de poste est disponible",
                 message=f"« {payload.role_title} » a été publiée par le Bureau.",
                 level="INFO", resource_type="document", resource_id=doc["document_id"], link="/aide")
    return doc


@router.put("/job-sheets/{document_id}")
async def update_job_sheet(document_id: str, payload: JobSheetUpdate,
                           admin: dict = Depends(require_admin)):
    sheet = await db.documents.find_one({"document_id": document_id,
                                         "category": JOB_SHEET_CATEGORY}, {"_id": 0})
    if not sheet:
        raise HTTPException(status_code=404, detail="Fiche de poste introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "visibility" in updates and updates["visibility"] not in VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    if "role_title" in updates:
        updates["title"] = f"Fiche de poste — {updates['role_title']}"
    updates["updated_at"] = iso(now_utc())
    await db.documents.update_one({"document_id": document_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "documents", document_id, new_value=updates)
    return await db.documents.find_one({"document_id": document_id}, {"_id": 0})


# ---------------------------------------------------------------- Guides d'utilisation
@router.get("/guides")
async def list_guides(module: Optional[str] = None, role_scope: Optional[str] = None,
                      status: Optional[str] = None, q: Optional[str] = None,
                      user: dict = Depends(active_user)):
    manager = await is_manager(user)
    filters = []
    if manager:
        if status:
            filters.append({"status": status})
    else:
        filters.append({"$or": [{"status": "PUBLISHED"}, {"author_id": user["user_id"]}]})
        filters.append(visible_filter(user))
    if module:
        filters.append({"module": module})
    if role_scope:
        filters.append({"role_scopes": role_scope})
    if q:
        filters.append({"$or": [{"title": {"$regex": q, "$options": "i"}},
                                {"summary": {"$regex": q, "$options": "i"}},
                                {"content": {"$regex": q, "$options": "i"}},
                                {"module": {"$regex": q, "$options": "i"}}]})
    query = {"$and": filters} if filters else {}
    items = await db.guides.find(query, {"_id": 0}).sort("title", 1).to_list(300)
    for guide in items:
        guide["module_label"] = MODULE_LABELS.get(guide.get("module"), guide.get("module"))
        guide["status_label"] = GUIDE_STATUS_LABELS.get(guide.get("status"), guide.get("status"))
        guide["visibility_label"] = VISIBILITY_LABELS.get(guide.get("visibility"), "Tous les membres")
        guide["role_scope_labels"] = [ROLE_SCOPE_LABELS.get(r, r) for r in (guide.get("role_scopes") or [])]
    return {"items": items, "total": len(items), "is_manager": manager,
            "pending_count": await db.guides.count_documents({"status": "PENDING"}) if manager else 0}


@router.post("/guides")
async def create_guide(payload: GuideIn, user: dict = Depends(active_user)):
    manager = await is_manager(user)
    if not manager and user["role"] != ROLE_PRO:
        raise HTTPException(status_code=403, detail="Seuls le Bureau et les professionnels rédigent un guide")
    if payload.module not in MODULES:
        raise HTTPException(status_code=400, detail="Module inconnu")
    if any(r not in ROLE_SCOPES for r in payload.role_scopes):
        raise HTTPException(status_code=400, detail="Rôle concerné invalide")
    if payload.visibility not in VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    doc = {"guide_id": new_id("gui"), **payload.model_dump(),
           "status": "PUBLISHED" if manager else "PENDING",
           "author_id": user["user_id"], "author_name": await display_name(user["user_id"]),
           "is_pro_contribution": not manager, "review_comment": None,
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.guides.insert_one(dict(doc))
    await log_action(user, "CREATE", "guides", doc["guide_id"], new_value={"titre": payload.title})
    if not manager:
        await notify_bureau(type="VALIDATION_REQUESTED", title="Guide professionnel à valider",
                            message=f"{doc['author_name']} propose « {payload.title} ».",
                            level="INFO", resource_type="guide", resource_id=doc["guide_id"],
                            link="/aide")
    return doc


@router.put("/guides/{guide_id}")
async def update_guide(guide_id: str, payload: GuideUpdate, user: dict = Depends(active_user)):
    guide = await db.guides.find_one({"guide_id": guide_id}, {"_id": 0})
    if not guide:
        raise HTTPException(status_code=404, detail="Guide introuvable")
    manager = await is_manager(user)
    if not manager and guide["author_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que vos propres guides")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates and not manager:
        raise HTTPException(status_code=403, detail="Seul le Bureau change le statut d'un guide")
    if "module" in updates and updates["module"] not in MODULES:
        raise HTTPException(status_code=400, detail="Module inconnu")
    if "visibility" in updates and updates["visibility"] not in VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    if not manager:
        updates["status"] = "PENDING"
    updates["updated_at"] = iso(now_utc())
    await db.guides.update_one({"guide_id": guide_id}, {"$set": updates})
    await log_action(user, "UPDATE", "guides", guide_id, new_value=updates)
    return await db.guides.find_one({"guide_id": guide_id}, {"_id": 0})


@router.post("/guides/{guide_id}/review")
async def review_guide(guide_id: str, payload: GuideReviewIn, admin: dict = Depends(require_admin)):
    guide = await db.guides.find_one({"guide_id": guide_id}, {"_id": 0})
    if not guide:
        raise HTTPException(status_code=404, detail="Guide introuvable")
    if payload.decision not in ("PUBLISH", "REFUSE"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    if payload.decision == "REFUSE" and not (payload.comment or "").strip():
        raise HTTPException(status_code=400, detail="Merci d'indiquer le motif du refus")
    if payload.visibility not in VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    status = "PUBLISHED" if payload.decision == "PUBLISH" else "REFUSED"
    await db.guides.update_one({"guide_id": guide_id},
                               {"$set": {"status": status, "visibility": payload.visibility,
                                         "review_comment": payload.comment,
                                         "reviewed_by": admin["user_id"],
                                         "reviewed_at": iso(now_utc()),
                                         "updated_at": iso(now_utc())}})
    await log_action(admin, "VALIDATE" if status == "PUBLISHED" else "REFUSE", "guides", guide_id,
                     new_value={"statut": status, "visibilité": payload.visibility})
    await notify(guide["author_id"], type="VALIDATION_RESULT",
                 title="Guide publié" if status == "PUBLISHED" else "Guide refusé",
                 message=f"« {guide['title']} » — "
                         f"{VISIBILITY_LABELS[payload.visibility] if status == 'PUBLISHED' else payload.comment}",
                 level="SUCCESS" if status == "PUBLISHED" else "WARNING",
                 resource_type="guide", resource_id=guide_id, link="/aide")
    return await db.guides.find_one({"guide_id": guide_id}, {"_id": 0})


@router.delete("/guides/{guide_id}")
async def delete_guide(guide_id: str, reason: Optional[str] = None,
                       admin: dict = Depends(require_admin)):
    guide = await db.guides.find_one({"guide_id": guide_id}, {"_id": 0})
    if not guide:
        raise HTTPException(status_code=404, detail="Guide introuvable")
    await db.guides.delete_one({"guide_id": guide_id})
    await log_action(admin, "DELETE", "guides", guide_id,
                     old_value={"titre": guide["title"]}, new_value={"motif": reason})
    return {"ok": True, "message": f"« {guide['title']} » supprimé."}


# ---------------------------------------------------------------- Espace aide central
@router.get("/help/center")
async def help_center(q: Optional[str] = None, user: dict = Depends(active_user)):
    guides = (await list_guides(q=q, user=user))["items"]
    sheets = (await list_job_sheets(q=q, user=user))["items"]
    by_module: dict = {}
    for guide in guides:
        if guide["status"] != "PUBLISHED" and not await is_manager(user):
            continue
        by_module.setdefault(guide["module"], []).append(guide)
    resources = await db.library_items.find({"status": {"$ne": "ARCHIVED"}},
                                            {"_id": 0, "item_id": 1, "title": 1, "category": 1}) \
        .sort("created_at", -1).limit(10).to_list(10)
    return {"guides": guides, "job_sheets": sheets,
            "by_module": [{"module": k, "label": MODULE_LABELS.get(k, k), "guides": v}
                          for k, v in sorted(by_module.items())],
            "resources": resources,
            "counts": {"guides": len(guides), "job_sheets": len(sheets)},
            "is_manager": await is_manager(user)}


# ---------------------------------------------------------------- Suivi qualitatif des pros
@router.get("/professionals/{user_id}/reviews")
async def list_pro_reviews(user_id: str, admin: dict = Depends(require_admin)):
    items = await db.pro_reviews.find({"professional_id": user_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(200)
    return {"items": items, "total": len(items),
            "professional_name": await display_name(user_id)}


@router.post("/professionals/{user_id}/reviews")
async def create_pro_review(user_id: str, payload: ProReviewIn, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "role": 1})
    if not target or target["role"] != ROLE_PRO:
        raise HTTPException(status_code=404, detail="Professionnel introuvable")
    doc = {"review_id": new_id("prev"), "professional_id": user_id,
           "observations": payload.observations, "strengths": payload.strengths,
           "improvements": payload.improvements, "context": payload.context,
           "author_id": admin["user_id"], "author_name": await display_name(admin["user_id"]),
           "created_at": iso(now_utc())}
    await db.pro_reviews.insert_one(dict(doc))
    # Retour strictement interne : aucune notification au professionnel concerné.
    await log_action(admin, "CREATE", "pro_reviews", doc["review_id"],
                     new_value={"professionnel": await display_name(user_id)})
    return doc


@router.delete("/professionals/reviews/{review_id}")
async def delete_pro_review(review_id: str, admin: dict = Depends(require_admin)):
    review = await db.pro_reviews.find_one({"review_id": review_id}, {"_id": 0})
    if not review:
        raise HTTPException(status_code=404, detail="Retour introuvable")
    await db.pro_reviews.delete_one({"review_id": review_id})
    await log_action(admin, "DELETE", "pro_reviews", review_id)
    return {"ok": True}


async def build_annual_recap(user_id: str, year: int) -> dict:
    start, end = f"{year}-01-01", f"{year}-12-31"
    period = {"$gte": start, "$lte": end}

    animated = await db.activities.find(
        {"$or": [{"professional_ids": user_id}, {"created_by": user_id}], "date": period},
        {"_id": 0, "activity_id": 1, "title": 1, "date": 1, "category": 1, "status": 1}) \
        .sort("date", 1).to_list(400)
    events = await db.events.find(
        {"$or": [{"professional_ids": user_id}, {"created_by": user_id}], "start_date": period},
        {"_id": 0, "event_id": 1, "title": 1, "start_date": 1, "event_type": 1}) \
        .sort("start_date", 1).to_list(200)

    participations = await db.participations.find(
        {"user_id": user_id, "registered_at": {"$gte": start, "$lte": f"{end}T23:59:59"}},
        {"_id": 0}).to_list(500)
    volunteer = [p for p in participations if p.get("role") in ("VOLUNTEER", "ORGANIZER",
                                                               "INTERVENANT", "PROFESSIONAL")]
    for p in volunteer:
        if p.get("activity_id"):
            act = await db.activities.find_one({"activity_id": p["activity_id"]},
                                               {"_id": 0, "title": 1, "date": 1})
            p["title"], p["date"] = (act or {}).get("title"), (act or {}).get("date")
        elif p.get("event_id"):
            ev = await db.events.find_one({"event_id": p["event_id"]}, {"_id": 0, "title": 1,
                                                                        "start_date": 1})
            p["title"], p["date"] = (ev or {}).get("title"), (ev or {}).get("start_date")

    teams = await db.project_teams.find({"member_id": user_id, "status": "ACTIVE"}, {"_id": 0}).to_list(100)
    projects = await db.projects.find({"project_id": {"$in": [t["project_id"] for t in teams]}},
                                      {"_id": 0, "project_id": 1, "title": 1, "status": 1}).to_list(100)

    sessions = await db.dog_reports.find({"author_id": user_id,
                                          "date": period}, {"_id": 0}).sort("date", 1).to_list(400)
    for s in sessions:
        dog = await db.dogs.find_one({"dog_id": s.get("dog_id")}, {"_id": 0, "name": 1})
        s["dog_name"] = (dog or {}).get("name")
    reservations = await db.terrain_reservations.find(
        {"requested_by": user_id, "date": period, "status": "CONFIRMED"}, {"_id": 0}) \
        .sort("date", 1).to_list(300)
    tasks = await db.tasks.find({"assignee_id": user_id, "status": "DONE"},
                                {"_id": 0, "task_id": 1, "title": 1, "status": 1,
                                 "updated_at": 1}).to_list(300)
    tasks = [t for t in tasks if (t.get("updated_at") or "")[:4] == str(year)]

    shares = await db.pro_shares.find({"professional_id": user_id, "date": period},
                                      {"_id": 0}).to_list(300)

    return {
        "user_id": user_id, "display_name": await display_name(user_id), "year": year,
        "activities": animated, "events": events, "volunteering": volunteer,
        "projects": projects, "sessions": sessions, "reservations": reservations,
        "tasks_done": tasks,
        "totals": {
            "activities": len(animated), "events": len(events), "volunteering": len(volunteer),
            "projects": len(projects), "sessions": len(sessions),
            "reservations": len(reservations), "tasks_done": len(tasks),
            "shares_amount": round(sum(float(s.get("amount") or 0) for s in shares), 2),
        },
    }


@router.get("/professionals/{user_id}/annual-recap")
async def annual_recap(user_id: str, year: Optional[int] = None,
                       admin: dict = Depends(require_admin)):
    return await build_annual_recap(user_id, year or now_utc().year)
