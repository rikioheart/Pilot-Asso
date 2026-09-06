"""Phase 4 — Activités, événements, calendrier, inscriptions, participations."""
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO, ROLE_MEMBER
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, notify_coordinators, display_name)
from settings_api import delegation_check

router = APIRouter(prefix="/api")

ACTIVITY_CATEGORIES = ["BALADE", "ATELIER", "CLASSE_LECTURE", "JOURNEE_THEME", "SENSIBILISATION",
                       "FORMATION", "RENCONTRE_PRO", "PREVENTION", "AUTRE"]
ACTIVITY_TYPES = ["COLLECTIVE", "INDIVIDUELLE", "FAMILIALE", "PRO", "MIXTE"]
ACTIVITY_STATUSES = ["PROPOSED", "PLANNED", "ACTIVE", "FULL", "DONE", "CANCELLED", "REFUSED", "ARCHIVED"]
EVENT_TYPES = ["RECURRING", "ONE_OFF", "THEMED_DAY", "TRAINING", "PRO_MEETING", "VISIO",
               "INTERVIEW", "LIVE", "PARTNERSHIP_EVENT", "OTHER"]
EVENT_STATUSES = ["DRAFT", "PLANNED", "CONFIRMED", "DONE", "CANCELLED", "ARCHIVED"]
PARTICIPATION_ROLES = ["PARTICIPANT", "VOLUNTEER", "ORGANIZER", "PROFESSIONAL", "INTERVENANT"]
VISIBILITY_MODES = ["INTERNAL_ONLY", "BUREAU", "PROJECT_TEAM", "PROFESSIONALS", "MEMBERS", "PUBLIC", "CUSTOM"]


class ActivityIn(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = None
    category: str = "AUTRE"
    type: str = "COLLECTIVE"
    recurrence: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[int] = None
    price_public: Optional[float] = None
    price_member: Optional[float] = None
    eligible_for_loyalty: bool = False
    loyalty_points: int = 1
    visibility: str = "MEMBERS"
    google_maps_url: Optional[str] = None
    is_remote: bool = False
    visio_url: Optional[str] = None
    google_forms_url: Optional[str] = None
    mentions: List[str] = []
    form_id: Optional[str] = None
    form_notify_date: Optional[str] = None
    project_id: Optional[str] = None
    event_id: Optional[str] = None
    professional_ids: List[str] = []


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[int] = None
    price_public: Optional[float] = None
    price_member: Optional[float] = None
    eligible_for_loyalty: Optional[bool] = None
    loyalty_points: Optional[int] = None
    visibility: Optional[str] = None
    status: Optional[str] = None
    event_id: Optional[str] = None
    google_maps_url: Optional[str] = None
    is_remote: Optional[bool] = None
    visio_url: Optional[str] = None
    google_forms_url: Optional[str] = None
    form_id: Optional[str] = None
    form_notify_date: Optional[str] = None


class EventIn(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = None
    event_type: str = "ONE_OFF"
    start_date: str
    end_date: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    visibility: str = "MEMBERS"
    capacity: Optional[int] = None
    status: str = "PLANNED"
    project_id: Optional[str] = None
    professional_ids: List[str] = []
    google_maps_url: Optional[str] = None
    is_remote: bool = False
    visio_url: Optional[str] = None
    google_meet_url: Optional[str] = None
    google_forms_url: Optional[str] = None
    mentions: List[str] = []
    form_id: Optional[str] = None
    form_notify_date: Optional[str] = None
    eligible_for_loyalty: bool = False
    loyalty_points: int = 1


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    visibility: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[str] = None
    project_id: Optional[str] = None
    google_maps_url: Optional[str] = None
    is_remote: Optional[bool] = None
    visio_url: Optional[str] = None
    google_meet_url: Optional[str] = None
    google_forms_url: Optional[str] = None
    form_id: Optional[str] = None
    form_notify_date: Optional[str] = None
    eligible_for_loyalty: Optional[bool] = None
    loyalty_points: Optional[int] = None


class RegisterIn(BaseModel):
    role: str = "PARTICIPANT"
    comment: Optional[str] = None


class AttendanceIn(BaseModel):
    user_id: str
    attendance_status: str  # PRESENT | ABSENT | EXCUSED | UNKNOWN


class ReviewIn(BaseModel):
    decision: str  # ACCEPT | REFUSE
    comment: Optional[str] = None


def allowed_visibility(user: dict) -> List[str]:
    if user["role"] == ROLE_ADMIN:
        return VISIBILITY_MODES
    if user["role"] == ROLE_PRO:
        return ["PROFESSIONALS", "MEMBERS", "PUBLIC"]
    return ["MEMBERS", "PUBLIC"]


async def enrich_counts(collection: str, ids: List[str], key: str):
    counts = {}
    for _id in ids:
        counts[_id] = await db.participations.count_documents(
            {key: _id, "registration_status": {"$in": ["CONFIRMED", "PENDING"]}})
    return counts


async def custom_values(kind: str) -> List[str]:
    docs = await db.taxonomies.find({"kind": kind}, {"_id": 0, "code": 1}).to_list(200)
    return [d["code"] for d in docs]


async def all_activity_categories() -> List[str]:
    return ACTIVITY_CATEGORIES + await custom_values("activity_category")


async def all_event_types() -> List[str]:
    return EVENT_TYPES + await custom_values("event_type")


class TaxonomyIn(BaseModel):
    kind: str
    label: str = Field(min_length=2)


@router.get("/taxonomies")
async def list_taxonomies(user: dict = Depends(active_user)):
    items = await db.taxonomies.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"items": items,
            "kinds": {"activity_category": "Catégorie d'activité", "activity_type": "Type d'activité",
                      "event_type": "Type d'événement"}}


@router.post("/taxonomies")
async def create_taxonomy(payload: TaxonomyIn, admin: dict = Depends(require_admin)):
    if payload.kind not in ("activity_category", "activity_type", "event_type"):
        raise HTTPException(status_code=400, detail="Type de nomenclature invalide")
    code = "".join(c if c.isalnum() else "_" for c in payload.label.upper())[:40]
    if await db.taxonomies.find_one({"kind": payload.kind, "code": code}):
        raise HTTPException(status_code=400, detail="Cette valeur existe déjà")
    doc = {"taxonomy_id": new_id("tax"), "kind": payload.kind, "code": code, "label": payload.label,
           "created_by": admin["user_id"], "created_at": iso(now_utc())}
    await db.taxonomies.insert_one(dict(doc))
    await log_action(admin, "CREATE", "taxonomies", doc["taxonomy_id"], new_value={"label": payload.label})
    return doc


@router.delete("/taxonomies/{taxonomy_id}")
async def delete_taxonomy(taxonomy_id: str, admin: dict = Depends(require_admin)):
    res = await db.taxonomies.delete_one({"taxonomy_id": taxonomy_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Valeur introuvable")
    await log_action(admin, "DELETE", "taxonomies", taxonomy_id)
    return {"ok": True}


class ParticipantIn(BaseModel):
    user_id: str
    role: str = "PARTICIPANT"


@router.post("/activities/{activity_id}/participants")
async def add_activity_participant(activity_id: str, payload: ParticipantIn,
                                   admin: dict = Depends(require("activities.validate"))):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activité introuvable")
    if payload.role not in PARTICIPATION_ROLES:
        raise HTTPException(status_code=400, detail="Rôle de participation invalide")
    if await db.participations.find_one({"activity_id": activity_id, "user_id": payload.user_id}):
        raise HTTPException(status_code=400, detail="Ce membre est déjà inscrit")
    doc = {"participation_id": new_id("prt"), "user_id": payload.user_id, "activity_id": activity_id,
           "event_id": activity.get("event_id"), "role": payload.role,
           "registration_status": "CONFIRMED", "registered_at": iso(now_utc()),
           "attendance_status": "UNKNOWN", "comment": "Ajouté par le Bureau",
           "validated_by": admin["user_id"], "validated_at": iso(now_utc())}
    await db.participations.insert_one(dict(doc))
    await log_action(admin, "REGISTER", "activities", activity_id, new_value={"user_id": payload.user_id})
    await notify(payload.user_id, type="REGISTRATION_CONFIRMED", title="Inscription ajoutée par le Bureau",
                 message=f"Vous êtes inscrit à « {activity['title']} ».", level="SUCCESS",
                 resource_type="activity", resource_id=activity_id, link="/activities")
    return doc


@router.post("/events/{event_id}/participants")
async def add_event_participant(event_id: str, payload: ParticipantIn,
                                admin: dict = Depends(require("events.edit"))):
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    if payload.role not in PARTICIPATION_ROLES:
        raise HTTPException(status_code=400, detail="Rôle de participation invalide")
    if await db.participations.find_one({"event_id": event_id, "user_id": payload.user_id,
                                         "activity_id": None}):
        raise HTTPException(status_code=400, detail="Ce membre est déjà inscrit")
    doc = {"participation_id": new_id("prt"), "user_id": payload.user_id, "event_id": event_id,
           "activity_id": None, "role": payload.role, "registration_status": "CONFIRMED",
           "registered_at": iso(now_utc()), "attendance_status": "UNKNOWN",
           "comment": "Ajouté par le Bureau", "validated_by": admin["user_id"],
           "validated_at": iso(now_utc())}
    await db.participations.insert_one(dict(doc))
    await log_action(admin, "REGISTER", "events", event_id, new_value={"user_id": payload.user_id})
    await notify(payload.user_id, type="REGISTRATION_CONFIRMED", title="Inscription ajoutée par le Bureau",
                 message=f"Vous êtes inscrit à « {event['title']} ».", level="SUCCESS",
                 resource_type="event", resource_id=event_id, link=f"/events/{event_id}")
    return doc


# ---------------------------------------------------------------- Activités
@router.get("/activities/meta")
async def activities_meta(user: dict = Depends(active_user)):
    custom = await db.taxonomies.find({}, {"_id": 0}).to_list(200)
    labels = {c["code"]: c["label"] for c in custom}
    return {"categories": await all_activity_categories(),
            "types": ACTIVITY_TYPES + await custom_values("activity_type"),
            "statuses": ACTIVITY_STATUSES,
            "event_types": await all_event_types(), "event_statuses": EVENT_STATUSES,
            "custom_labels": labels, "custom_taxonomies": custom,
            "visibility_modes": VISIBILITY_MODES, "participation_roles": PARTICIPATION_ROLES}


@router.get("/activities")
async def list_activities(category: Optional[str] = None, status: Optional[str] = None,
                          upcoming: bool = False, q: Optional[str] = None, event_id: Optional[str] = None,
                          limit: int = 200, user: dict = Depends(require("activities.view"))):
    filters = [{"visibility": {"$in": allowed_visibility(user)}}]
    if user["role"] != ROLE_ADMIN:
        filters.append({"status": {"$in": ["PLANNED", "ACTIVE", "FULL", "DONE"]}})
    if status:
        filters = [f for f in filters if "status" not in f] + [{"status": status}]
    if category:
        filters.append({"category": category})
    if event_id:
        filters.append({"event_id": event_id})
    if upcoming:
        filters.append({"date": {"$gte": iso(now_utc())[:10]}})
    if q:
        filters.append({"title": {"$regex": q, "$options": "i"}})
    items = await db.activities.find({"$and": filters}, {"_id": 0}).sort("date", 1).limit(limit).to_list(limit)
    ids = [a["activity_id"] for a in items]
    counts = await enrich_counts("activities", ids, "activity_id")
    mine = {p["activity_id"] async for p in db.participations.find(
        {"user_id": user["user_id"], "activity_id": {"$in": ids}}, {"_id": 0, "activity_id": 1})}
    for a in items:
        a["registered_count"] = counts.get(a["activity_id"], 0)
        a["is_registered"] = a["activity_id"] in mine
    return {"items": items, "total": len(items)}


async def _notify_mentions(mentions, actor, kind_label, title, resource_type, resource_id, link):
    if not mentions:
        return
    name = await display_name(actor["user_id"])
    for uid in dict.fromkeys(mentions):
        if uid and uid != actor["user_id"]:
            await notify(uid, type="MENTION", title="Vous avez été mentionné",
                         message=f"{name} vous a mentionné dans {kind_label} « {title} ».", level="ACTION",
                         resource_type=resource_type, resource_id=resource_id, link=link)


@router.post("/activities")
async def create_activity(payload: ActivityIn, user: dict = Depends(require("activities.propose"))):
    if payload.category not in await all_activity_categories() \
            or payload.type not in ACTIVITY_TYPES + await custom_values("activity_type"):
        raise HTTPException(status_code=400, detail="Catégorie ou type d'activité invalide")
    if payload.visibility not in VISIBILITY_MODES:
        raise HTTPException(status_code=400, detail="Mode de visibilité invalide")
    can_publish = rbac.has_permission(user, "activities.validate")
    delegated = None
    if not can_publish:
        check = await delegation_check(user, capacity=payload.capacity,
                                       prices=[payload.price_public, payload.price_member],
                                       location=payload.location, date=payload.date)
        if check["eligible"]:
            delegated = check
    doc = {
        "activity_id": new_id("act"), **payload.model_dump(),
        "status": "PLANNED" if (can_publish or delegated) else "PROPOSED",
        "loyalty_card_types": ["STANDARD"], "created_by": user["user_id"],
        "review_comment": None, "reviewed_by": None,
        "delegated_publication": bool(delegated),
        "moderation_until": iso(now_utc() + timedelta(hours=delegated["settings"].get("moderation_hours", 48))) if delegated else None,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.activities.insert_one(doc)
    await log_action(user, "CREATE", "activities", doc["activity_id"],
                     new_value={"title": payload.title, "delegated_publication": bool(delegated)})
    if delegated:
        name = await display_name(user["user_id"])
        await notify_bureau(type="DELEGATED_PUBLICATION", title="Activité publiée par délégation",
                            message=f"{name} a publié « {payload.title} » (critères Bureau respectés). "
                                    f"Modération possible pendant {delegated['settings'].get('moderation_hours', 48)} h.",
                            level="WARNING", resource_type="activity", resource_id=doc["activity_id"],
                            link=f"/activities?focus={doc['activity_id']}")
    elif not can_publish:
        name = await display_name(user["user_id"])
        await notify_bureau(type="NEW_PROPOSAL", title="Nouvelle activité proposée",
                            message=f"{name} propose « {payload.title} ».", level="ACTION",
                            resource_type="activity", resource_id=doc["activity_id"], link="/activities")
        await notify_coordinators(type="NEW_PROPOSAL", title="Nouvelle activité proposée",
                                  message=f"{name} propose « {payload.title} ».", level="ACTION",
                                  resource_type="activity", resource_id=doc["activity_id"], link="/activities")
    await _notify_mentions(payload.mentions, user, "activité", payload.title, "activity", doc["activity_id"], "/activities")
    return {k: v for k, v in doc.items() if k != "_id"}


async def _get_activity(activity_id: str, user: dict) -> dict:
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activité introuvable")
    if user["role"] != ROLE_ADMIN and activity["visibility"] not in allowed_visibility(user) \
            and activity["created_by"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Cette activité ne vous est pas visible")
    return activity


@router.get("/activities/{activity_id}")
async def get_activity(activity_id: str, user: dict = Depends(require("activities.view"))):
    activity = await _get_activity(activity_id, user)
    participations = await db.participations.find({"activity_id": activity_id}, {"_id": 0}).to_list(300)
    if user["role"] != ROLE_ADMIN:
        participations = [p for p in participations if p["user_id"] == user["user_id"]]
    else:
        for p in participations:
            p["display_name"] = await display_name(p["user_id"])
    return {"activity": activity, "participations": participations,
            "registered_count": await db.participations.count_documents(
                {"activity_id": activity_id, "registration_status": {"$in": ["CONFIRMED", "PENDING"]}})}


@router.put("/activities/{activity_id}")
async def update_activity(activity_id: str, payload: ActivityUpdate, user: dict = Depends(active_user)):
    activity = await _get_activity(activity_id, user)
    is_owner = activity["created_by"] == user["user_id"]
    if user["role"] != ROLE_ADMIN and not (is_owner and rbac.has_permission(user, "activities.propose")):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier cette activité")
    updates = payload.model_dump(exclude_none=True)
    if "status" in updates:
        if updates["status"] not in ACTIVITY_STATUSES:
            raise HTTPException(status_code=400, detail="Statut d'activité invalide")
        if not rbac.has_permission(user, "activities.validate"):
            raise HTTPException(status_code=403, detail="Seul le Bureau change le statut d'une activité")
    if "visibility" in updates and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Seul le Bureau modifie la visibilité")
    if ("eligible_for_loyalty" in updates or "loyalty_points" in updates) \
            and not rbac.has_permission(user, "loyalty.manage"):
        raise HTTPException(status_code=403, detail="Seul le Bureau définit l'éligibilité à la carte de fidélité")
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.activities.update_one({"activity_id": activity_id}, {"$set": updates})
    await log_action(user, "UPDATE", "activities", activity_id,
                     old_value={k: activity.get(k) for k in updates}, new_value=updates)
    async for p in db.participations.find({"activity_id": activity_id}, {"_id": 0, "user_id": 1}):
        await notify(p["user_id"], type="ACTIVITY_UPDATED", title="Activité modifiée",
                     message=f"« {activity['title']} » a été mise à jour.", level="INFO",
                     resource_type="activity", resource_id=activity_id, link="/activities")
    return await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})


@router.post("/activities/{activity_id}/review")
async def review_activity(activity_id: str, payload: ReviewIn, user: dict = Depends(require("activities.validate"))):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activité introuvable")
    if payload.decision not in ("ACCEPT", "REFUSE"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    is_admin = user["role"] == ROLE_ADMIN
    # Départage de validation double : la première décision fait foi.
    prev_reviewer = activity.get("reviewed_by")
    if prev_reviewer and prev_reviewer != user["user_id"]:
        prev_at = activity.get("reviewed_at")
        within_48h = False
        if prev_at:
            try:
                dt = prev_at if isinstance(prev_at, str) else iso(prev_at)
                within_48h = now_utc() - now_utc().fromisoformat(dt.replace("Z", "+00:00")) < timedelta(hours=48)
            except Exception:
                within_48h = False
        can_override = is_admin and activity.get("reviewer_role") == "PRO_COORDINATEUR" and within_48h
        if not can_override:
            return {"already_decided": True, "decision": activity.get("status"),
                    "decided_by": activity.get("reviewed_by_name"),
                    "message": f"La décision a déjà été prise par {activity.get('reviewed_by_name') or 'un autre valideur'}."}
    status = "PLANNED" if payload.decision == "ACCEPT" else "REFUSED"
    reviewer_role = "ADMIN" if is_admin else "PRO_COORDINATEUR"
    reviewer_name = await display_name(user["user_id"])
    is_override = bool(prev_reviewer and prev_reviewer != user["user_id"])
    await db.activities.update_one({"activity_id": activity_id}, {"$set": {
        "status": status, "review_comment": payload.comment, "reviewed_by": user["user_id"],
        "reviewed_by_name": reviewer_name, "reviewer_role": reviewer_role,
        "reviewed_at": iso(now_utc()), "updated_at": iso(now_utc())}})
    await log_action(user, "REVIEW", "activities", activity_id,
                     new_value={"status": status, "override": is_override})
    await notify(activity["created_by"],
                 type="ACTIVITY_ACCEPTED" if status == "PLANNED" else "ACTIVITY_REFUSED",
                 title="Activité acceptée" if status == "PLANNED" else "Activité refusée",
                 message=payload.comment or f"« {activity['title']} » : décision enregistrée.",
                 level="SUCCESS" if status == "PLANNED" else "WARNING",
                 resource_type="activity", resource_id=activity_id, link="/activities")
    if not is_override:
        # Prévenir les autres valideurs que la décision est prise, sans qu'ils puissent la contredire.
        decision_label = "acceptée" if status == "PLANNED" else "refusée"
        recipients = set()
        async for admin in db.users.find({"role": ROLE_ADMIN, "status": "ACTIVE"}, {"_id": 0, "user_id": 1}):
            recipients.add(admin["user_id"])
        async for pro in db.users.find({"access_level": "PRO_COORDINATEUR", "status": "ACTIVE"},
                                       {"_id": 0, "user_id": 1}):
            recipients.add(pro["user_id"])
        recipients.discard(user["user_id"])
        for uid in recipients:
            extra = (" Vous pouvez revenir sur cette décision pendant 48 h."
                     if reviewer_role == "PRO_COORDINATEUR" else "")
            await notify(uid, type="DECISION_TAKEN", title="Décision déjà prise",
                         message=f"« {activity['title']} » a été {decision_label} par {reviewer_name}.{extra}",
                         level="INFO", resource_type="activity", resource_id=activity_id, link="/activities")
    return await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})


async def _notify_registration(user: dict, title: str, resource_type: str, resource_id: str,
                               candidates: list, link: str):
    """Inscription d'un membre : notifie le(s) pro(s) responsable(s) et le Bureau."""
    name = await display_name(user["user_id"])
    pros = {c for c in candidates if c and c != user["user_id"]}
    if pros:
        async for pro in db.users.find({"user_id": {"$in": list(pros)}, "role": ROLE_PRO, "status": "ACTIVE"},
                                       {"_id": 0, "user_id": 1}):
            await notify(pro["user_id"], type="ACTIVITY_REGISTRATION", title="Nouvelle inscription",
                         message=f"{name} s'est inscrit à « {title} ».", level="INFO",
                         resource_type=resource_type, resource_id=resource_id, link=link)
    await notify_bureau(type="ACTIVITY_REGISTRATION", title="Nouvelle inscription",
                        message=f"{name} s'est inscrit à « {title} ».", level="INFO",
                        resource_type=resource_type, resource_id=resource_id, link=link)


@router.post("/activities/{activity_id}/register")
async def register_activity(activity_id: str, payload: RegisterIn, user: dict = Depends(require("activities.view"))):
    activity = await _get_activity(activity_id, user)
    if activity["status"] in ("CANCELLED", "REFUSED", "ARCHIVED", "DONE"):
        raise HTTPException(status_code=400, detail="Les inscriptions ne sont pas ouvertes")
    if payload.role not in PARTICIPATION_ROLES:
        raise HTTPException(status_code=400, detail="Rôle de participation invalide")
    existing = await db.participations.find_one({"activity_id": activity_id, "user_id": user["user_id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Vous êtes déjà inscrit à cette activité")
    count = await db.participations.count_documents(
        {"activity_id": activity_id, "registration_status": {"$in": ["CONFIRMED", "PENDING"]}})
    if activity.get("capacity") and count >= activity["capacity"]:
        raise HTTPException(status_code=400, detail="Cette activité est complète")
    doc = {"participation_id": new_id("prt"), "user_id": user["user_id"], "activity_id": activity_id,
           "event_id": activity.get("event_id"), "role": payload.role, "registration_status": "CONFIRMED",
           "registered_at": iso(now_utc()), "attendance_status": "UNKNOWN", "comment": payload.comment,
           "validated_by": None, "validated_at": None}
    await db.participations.insert_one(doc)
    await log_action(user, "REGISTER", "activities", activity_id)
    await notify(user["user_id"], type="REGISTRATION_CONFIRMED", title="Inscription confirmée",
                 message=f"Vous êtes inscrit à « {activity['title']} ».", level="SUCCESS",
                 resource_type="activity", resource_id=activity_id, link="/activities")
    await _notify_registration(user, activity["title"], "activity", activity_id,
                               [activity.get("created_by"), *(activity.get("professional_ids") or [])],
                               f"/activities?focus={activity_id}")
    if activity.get("capacity") and count + 1 >= activity["capacity"]:
        await db.activities.update_one({"activity_id": activity_id}, {"$set": {"status": "FULL"}})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/activities/{activity_id}/register")
async def unregister_activity(activity_id: str, user: dict = Depends(require("activities.view"))):
    res = await db.participations.delete_one({"activity_id": activity_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas inscrit à cette activité")
    await db.activities.update_one({"activity_id": activity_id, "status": "FULL"}, {"$set": {"status": "ACTIVE"}})
    await log_action(user, "UNREGISTER", "activities", activity_id)
    return {"ok": True}


# ---------------------------------------------------------------- Événements
@router.get("/events")
async def list_events(event_type: Optional[str] = None, upcoming: bool = False, q: Optional[str] = None,
                      limit: int = 200, user: dict = Depends(require("events.view"))):
    filters = [{"visibility": {"$in": allowed_visibility(user)}}]
    if user["role"] != ROLE_ADMIN:
        filters.append({"status": {"$in": ["PLANNED", "CONFIRMED", "DONE"]}})
    if event_type:
        filters.append({"event_type": event_type})
    if upcoming:
        filters.append({"start_date": {"$gte": iso(now_utc())[:10]}})
    if q:
        filters.append({"title": {"$regex": q, "$options": "i"}})
    items = await db.events.find({"$and": filters}, {"_id": 0}).sort("start_date", 1).limit(limit).to_list(limit)
    ids = [e["event_id"] for e in items]
    counts = await enrich_counts("events", ids, "event_id")
    mine = {p["event_id"] async for p in db.participations.find(
        {"user_id": user["user_id"], "event_id": {"$in": ids}}, {"_id": 0, "event_id": 1})}
    for e in items:
        e["registered_count"] = counts.get(e["event_id"], 0)
        e["is_registered"] = e["event_id"] in mine
        e["activities_count"] = await db.activities.count_documents({"event_id": e["event_id"]})
    return {"items": items, "total": len(items)}


@router.post("/events")
async def create_event(payload: EventIn, user: dict = Depends(require("events.create"))):
    if payload.event_type not in await all_event_types() or payload.status not in EVENT_STATUSES:
        raise HTTPException(status_code=400, detail="Type ou statut d'événement invalide")
    if payload.visibility not in VISIBILITY_MODES:
        raise HTTPException(status_code=400, detail="Mode de visibilité invalide")
    doc = {
        "event_id": new_id("evt"), **payload.model_dump(), "organizer_id": user["user_id"],
        "activity_ids": [], "financial_summary": None, "delegated_publication": False, "moderation_until": None,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    if user["role"] != ROLE_ADMIN and payload.status in ("PLANNED", "CONFIRMED"):
        check = await delegation_check(user, capacity=payload.capacity, prices=[],
                                       location=payload.location, date=payload.start_date)
        name = await display_name(user["user_id"])
        if check["eligible"]:
            hours = check["settings"].get("moderation_hours", 48)
            doc["delegated_publication"] = True
            doc["moderation_until"] = iso(now_utc() + timedelta(hours=hours))
            await notify_bureau(type="DELEGATED_PUBLICATION", title="Événement publié par délégation",
                                message=f"{name} a publié « {payload.title} ». Modération possible pendant {hours} h.",
                                level="WARNING", resource_type="event", resource_id=doc["event_id"],
                                link=f"/events/{doc['event_id']}")
        else:
            doc["status"] = "DRAFT"
            doc["pending_validation"] = True
            doc["delegation_reasons"] = check["reasons"]
            await notify_bureau(type="NEW_PROPOSAL", title="Événement à valider",
                                message=f"{name} propose « {payload.title} » (hors critères : {', '.join(check['reasons'])}).",
                                level="ACTION", resource_type="event", resource_id=doc["event_id"],
                                link=f"/events/{doc['event_id']}")
            await notify_coordinators(type="NEW_PROPOSAL", title="Événement à valider",
                                      message=f"{name} propose « {payload.title} ».",
                                      level="ACTION", resource_type="event", resource_id=doc["event_id"],
                                      link=f"/events/{doc['event_id']}")
    await db.events.insert_one(doc)
    await log_action(user, "CREATE", "events", doc["event_id"],
                     new_value={"title": payload.title, "delegated_publication": doc["delegated_publication"]})
    await _notify_mentions(payload.mentions, user, "l'événement", payload.title, "event", doc["event_id"], f"/events/{doc['event_id']}")
    return {k: v for k, v in doc.items() if k != "_id"}


async def _get_event(event_id: str, user: dict) -> dict:
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    if user["role"] != ROLE_ADMIN and event["visibility"] not in allowed_visibility(user) \
            and event["organizer_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Cet événement ne vous est pas visible")
    return event


@router.get("/events/{event_id}")
async def get_event(event_id: str, user: dict = Depends(require("events.view"))):
    event = await _get_event(event_id, user)
    activities = await db.activities.find({"event_id": event_id}, {"_id": 0}).sort("date", 1).to_list(100)
    participations = await db.participations.find({"event_id": event_id}, {"_id": 0}).to_list(500)
    is_organizer = user["role"] == ROLE_ADMIN or event["organizer_id"] == user["user_id"]
    if is_organizer:
        for p in participations:
            p["display_name"] = await display_name(p["user_id"])
    else:
        participations = [p for p in participations if p["user_id"] == user["user_id"]]
    tasks = []
    if event.get("project_id") and rbac.has_permission(user, "tasks.view"):
        tasks = await db.tasks.find({"project_id": event["project_id"]},
                                    {"_id": 0, "task_id": 1, "title": 1, "status": 1}).to_list(100)
    event["organizer_name"] = await display_name(event["organizer_id"])
    return {"event": event, "activities": activities, "participations": participations, "tasks": tasks,
            "is_organizer": is_organizer,
            "participants_count": len([p for p in participations if p["role"] == "PARTICIPANT"]),
            "volunteers_count": len([p for p in participations if p["role"] == "VOLUNTEER"])}


@router.put("/events/{event_id}")
async def update_event(event_id: str, payload: EventUpdate, user: dict = Depends(require("events.edit"))):
    event = await _get_event(event_id, user)
    if user["role"] != ROLE_ADMIN and event["organizer_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Vous n'organisez pas cet événement")
    updates = payload.model_dump(exclude_none=True)
    if "visibility" in updates and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Seul le Bureau modifie la visibilité")
    if "status" in updates and updates["status"] not in EVENT_STATUSES:
        raise HTTPException(status_code=400, detail="Statut d'événement invalide")
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.events.update_one({"event_id": event_id}, {"$set": updates})
    await log_action(user, "UPDATE", "events", event_id,
                     old_value={k: event.get(k) for k in updates}, new_value=updates)
    async for p in db.participations.find({"event_id": event_id}, {"_id": 0, "user_id": 1}):
        await notify(p["user_id"], type="EVENT_UPDATED", title="Événement modifié",
                     message=f"« {event['title']} » a été mis à jour.", level="INFO",
                     resource_type="event", resource_id=event_id, link=f"/events/{event_id}")
    return await db.events.find_one({"event_id": event_id}, {"_id": 0})


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, admin: dict = Depends(require_admin)):
    event = await db.events.find_one({"event_id": event_id})
    if not event:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    await db.events.update_one({"event_id": event_id},
                              {"$set": {"status": "ARCHIVED", "updated_at": iso(now_utc())}})
    await log_action(admin, "ARCHIVE", "events", event_id)
    return {"ok": True}


@router.post("/events/{event_id}/register")
async def register_event(event_id: str, payload: RegisterIn, user: dict = Depends(require("events.view"))):
    event = await _get_event(event_id, user)
    if event["status"] in ("CANCELLED", "ARCHIVED", "DONE"):
        raise HTTPException(status_code=400, detail="Les inscriptions ne sont pas ouvertes")
    if payload.role not in PARTICIPATION_ROLES:
        raise HTTPException(status_code=400, detail="Rôle de participation invalide")
    if await db.participations.find_one({"event_id": event_id, "user_id": user["user_id"], "activity_id": None}):
        raise HTTPException(status_code=400, detail="Vous êtes déjà inscrit à cet événement")
    count = await db.participations.count_documents(
        {"event_id": event_id, "activity_id": None, "role": "PARTICIPANT"})
    if event.get("capacity") and payload.role == "PARTICIPANT" and count >= event["capacity"]:
        raise HTTPException(status_code=400, detail="Cet événement est complet")
    doc = {"participation_id": new_id("prt"), "user_id": user["user_id"], "event_id": event_id,
           "activity_id": None, "role": payload.role, "registration_status": "CONFIRMED",
           "registered_at": iso(now_utc()), "attendance_status": "UNKNOWN", "comment": payload.comment,
           "validated_by": None, "validated_at": None}
    await db.participations.insert_one(doc)
    await log_action(user, "REGISTER", "events", event_id, new_value={"role": payload.role})
    await notify(user["user_id"], type="REGISTRATION_CONFIRMED", title="Inscription confirmée",
                 message=f"Vous êtes inscrit à « {event['title']} » ({payload.role.lower()}).",
                 level="SUCCESS", resource_type="event", resource_id=event_id, link=f"/events/{event_id}")
    await _notify_registration(user, event["title"], "event", event_id,
                               [event.get("organizer_id"), *(event.get("professional_ids") or [])],
                               f"/events/{event_id}")
    if payload.role == "VOLUNTEER":
        name = await display_name(user["user_id"])
        await notify_bureau(type="VOLUNTEER_REQUEST", title="Nouveau bénévole sur un événement",
                            message=f"{name} se propose comme bénévole pour « {event['title']} ».",
                            level="ACTION", resource_type="event", resource_id=event_id, link=f"/events/{event_id}")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/events/{event_id}/register")
async def unregister_event(event_id: str, user: dict = Depends(require("events.view"))):
    res = await db.participations.delete_one({"event_id": event_id, "user_id": user["user_id"], "activity_id": None})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas inscrit à cet événement")
    await log_action(user, "UNREGISTER", "events", event_id)
    return {"ok": True}


@router.post("/events/{event_id}/attendance")
async def set_attendance(event_id: str, payload: AttendanceIn, user: dict = Depends(require("events.edit"))):
    event = await _get_event(event_id, user)
    if user["role"] != ROLE_ADMIN and event["organizer_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Vous n'organisez pas cet événement")
    if payload.attendance_status not in ("PRESENT", "ABSENT", "EXCUSED", "UNKNOWN"):
        raise HTTPException(status_code=400, detail="Statut de présence invalide")
    res = await db.participations.update_one(
        {"event_id": event_id, "user_id": payload.user_id, "activity_id": None},
        {"$set": {"attendance_status": payload.attendance_status, "validated_by": user["user_id"],
                  "validated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Participation introuvable")
    await log_action(user, "ATTENDANCE", "events", event_id,
                     new_value={"user_id": payload.user_id, "status": payload.attendance_status})
    if payload.attendance_status == "PRESENT":
        from loyalty import auto_stamp
        await auto_stamp(payload.user_id, user, event=event)
    return {"ok": True}


class ActivityAttendanceIn(BaseModel):
    user_id: str
    attendance_status: str


@router.post("/activities/{activity_id}/attendance")
async def set_activity_attendance(activity_id: str, payload: ActivityAttendanceIn,
                                  user: dict = Depends(require("activities.validate"))):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activité introuvable")
    if payload.attendance_status not in ("PRESENT", "ABSENT", "EXCUSED", "UNKNOWN"):
        raise HTTPException(status_code=400, detail="Statut de présence invalide")
    res = await db.participations.update_one(
        {"activity_id": activity_id, "user_id": payload.user_id},
        {"$set": {"attendance_status": payload.attendance_status, "validated_by": user["user_id"],
                  "validated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Participation introuvable")
    await log_action(user, "ATTENDANCE", "activities", activity_id,
                     new_value={"user_id": payload.user_id, "status": payload.attendance_status})
    stamp = None
    if payload.attendance_status == "PRESENT":
        from loyalty import auto_stamp
        stamp = await auto_stamp(payload.user_id, user, activity=activity)
    return {"ok": True, "stamp": stamp}


# ---------------------------------------------------------------- Calendrier & participations
@router.get("/calendar")
async def calendar(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(active_user)):
    entries = []
    if rbac.has_permission(user, "activities.view"):
        filters = [{"visibility": {"$in": allowed_visibility(user)}}, {"date": {"$ne": None}}]
        if user["role"] != ROLE_ADMIN:
            filters.append({"status": {"$in": ["PLANNED", "ACTIVE", "FULL", "DONE"]}})
        if start:
            filters.append({"date": {"$gte": start}})
        if end:
            filters.append({"date": {"$lte": end}})
        async for a in db.activities.find({"$and": filters}, {"_id": 0}):
            entries.append({"id": a["activity_id"], "kind": "ACTIVITY", "title": a["title"], "date": a["date"],
                            "start_time": a.get("start_time"), "location": a.get("location"),
                            "category": a.get("category"), "status": a["status"], "link": "/activities"})
    if rbac.has_permission(user, "events.view"):
        filters = [{"visibility": {"$in": allowed_visibility(user)}}]
        if user["role"] != ROLE_ADMIN:
            filters.append({"status": {"$in": ["PLANNED", "CONFIRMED", "DONE"]}})
        if start:
            filters.append({"start_date": {"$gte": start}})
        if end:
            filters.append({"start_date": {"$lte": end}})
        async for e in db.events.find({"$and": filters}, {"_id": 0}):
            entries.append({"id": e["event_id"], "kind": "EVENT", "title": e["title"],
                            "date": (e["start_date"] or "")[:10], "start_time": None,
                            "location": e.get("location"), "category": e.get("event_type"),
                            "status": e["status"], "link": f"/events/{e['event_id']}"})
    if rbac.has_permission(user, "tasks.view"):
        query = {"deadline": {"$ne": None}, "status": {"$nin": ["COMPLETED", "ARCHIVED", "CANCELLED"]}}
        if user["role"] != ROLE_ADMIN:
            query["assigned_user_id"] = user["user_id"]
        async for t in db.tasks.find(query, {"_id": 0}).limit(200):
            entries.append({"id": t["task_id"], "kind": "TASK", "title": t["title"],
                            "date": (t["deadline"] or "")[:10], "start_time": None, "location": None,
                            "category": "ÉCHÉANCE", "status": t["status"],
                            "link": f"/projects/{t['project_id']}"})
    entries.sort(key=lambda x: x["date"] or "")
    return {"entries": entries, "total": len(entries)}


@router.get("/participations/me")
async def my_participations(user: dict = Depends(active_user)):
    items = await db.participations.find({"user_id": user["user_id"]}, {"_id": 0}) \
        .sort("registered_at", -1).to_list(200)
    for p in items:
        if p.get("activity_id"):
            activity = await db.activities.find_one({"activity_id": p["activity_id"]},
                                                    {"_id": 0, "title": 1, "date": 1, "location": 1})
            p["title"] = (activity or {}).get("title")
            p["date"] = (activity or {}).get("date")
            p["location"] = (activity or {}).get("location")
            p["link"] = "/activities"
        elif p.get("event_id"):
            event = await db.events.find_one({"event_id": p["event_id"]},
                                             {"_id": 0, "title": 1, "start_date": 1, "location": 1})
            p["title"] = (event or {}).get("title")
            p["date"] = ((event or {}).get("start_date") or "")[:10]
            p["location"] = (event or {}).get("location")
            p["link"] = f"/events/{p['event_id']}"
    return {"items": items, "total": len(items)}
