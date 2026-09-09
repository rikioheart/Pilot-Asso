"""Phase 6 — Carte de fidélité : QR sécurisé, règles configurables, scan et tampons."""
import secrets
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import rbac
from rbac import ROLE_ADMIN, ROLE_MEMBER
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, display_name)

router = APIRouter(prefix="/api")

CARD_TYPES = ["STANDARD", "FAMILLE", "PRO"]


class RuleIn(BaseModel):
    label: str = Field(min_length=2)
    kind: str = "STAMP"  # STAMP | REWARD
    activity_id: Optional[str] = None
    activity_category: Optional[str] = None
    points: int = 1
    threshold: Optional[int] = None
    reward: Optional[str] = None
    card_types: List[str] = ["STANDARD"]
    validity_days: Optional[int] = None
    is_active: bool = True
    badge: bool = False
    badge_name: Optional[str] = None


class StampIn(BaseModel):
    user_id: Optional[str] = None
    qr_token: Optional[str] = None
    activity_id: Optional[str] = None
    event_id: Optional[str] = None
    comment: Optional[str] = None
    scanned_at: Optional[str] = None
    offline: bool = False


class ManualStampIn(BaseModel):
    user_id: str
    points: int = 1
    reason: str = Field(min_length=3)
    label: Optional[str] = None


async def recompute_total(card_id: str) -> int:
    stamps = await db.loyalty_stamps.find({"card_id": card_id}, {"_id": 0, "points": 1}).to_list(1000)
    total = max(sum(s.get("points", 0) for s in stamps), 0)
    await db.loyalty_cards.update_one({"card_id": card_id},
                                      {"$set": {"total_points": total, "updated_at": iso(now_utc())}})
    return total


async def ensure_card(user_id: str) -> dict:
    card = await db.loyalty_cards.find_one({"user_id": user_id}, {"_id": 0})
    if card:
        return card
    card = {
        "card_id": new_id("card"), "user_id": user_id, "card_type": "STANDARD",
        "qr_token": secrets.token_urlsafe(24), "total_points": 0, "status": "ACTIVE",
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.loyalty_cards.insert_one(dict(card))
    return card


SOURCE_LABELS = {
    "QR_SCAN": "Scan QR Code", "PRO_VALIDATION": "Validation par un professionnel",
    "BUREAU_MANUAL": "Ajout manuel du Bureau", "BUREAU_REMOVAL": "Retrait manuel du Bureau",
    "AUTO_PARTICIPATION": "Validation automatique de participation",
}


async def card_payload(user_id: str) -> dict:
    card = await ensure_card(user_id)
    stamps = await db.loyalty_stamps.find({"card_id": card["card_id"]}, {"_id": 0}) \
        .sort("created_at", -1).limit(100).to_list(100)
    rewards = await db.loyalty_rules.find({"kind": "REWARD", "is_active": True}, {"_id": 0}) \
        .sort("threshold", 1).to_list(50)
    next_reward = next((r for r in rewards if (r.get("threshold") or 0) > card["total_points"]), None)
    badges = [{"name": r.get("badge_name") or r.get("reward") or r.get("label"), "threshold": r.get("threshold")}
              for r in rewards if r.get("badge") and (r.get("threshold") or 0) <= card["total_points"]]
    return {"card": card, "stamps": stamps, "rewards": rewards, "next_reward": next_reward,
            "source_labels": SOURCE_LABELS, "badges": badges,
            "progress": (card["total_points"] / next_reward["threshold"] * 100) if next_reward else 100}


@router.get("/loyalty/badges")
async def member_badges(user_id: str, user: dict = Depends(active_user)):
    """Badges de fidélité atteints par un membre (visibles par la communauté)."""
    card = await ensure_card(user_id)
    rewards = await db.loyalty_rules.find({"kind": "REWARD", "is_active": True, "badge": True},
                                          {"_id": 0}).sort("threshold", 1).to_list(50)
    return {"badges": [{"name": r.get("badge_name") or r.get("reward") or r.get("label"),
                        "threshold": r.get("threshold")}
                       for r in rewards if (r.get("threshold") or 0) <= card["total_points"]]}


# ---------------------------------------------------------------- Ma carte
@router.get("/loyalty/me")
async def my_card(user: dict = Depends(require("loyalty.view_own"))):
    return await card_payload(user["user_id"])


@router.post("/loyalty/me/regenerate")
async def regenerate_qr(user: dict = Depends(require("loyalty.view_own"))):
    card = await ensure_card(user["user_id"])
    token = secrets.token_urlsafe(24)
    await db.loyalty_cards.update_one({"card_id": card["card_id"]},
                                     {"$set": {"qr_token": token, "updated_at": iso(now_utc())}})
    await log_action(user, "REGENERATE_QR", "loyalty", card["card_id"])
    return await card_payload(user["user_id"])


@router.post("/loyalty/{user_id}/regenerate")
async def regenerate_member_qr(user_id: str, admin: dict = Depends(require("loyalty.manage"))):
    """Le Bureau régénère le QR d'un adhérent : l'ancien devient immédiatement invalide."""
    card = await ensure_card(user_id)
    token = secrets.token_urlsafe(24)
    await db.loyalty_cards.update_one({"card_id": card["card_id"]},
                                      {"$set": {"qr_token": token, "updated_at": iso(now_utc())}})
    await log_action(admin, "REGENERATE_QR", "loyalty", card["card_id"], new_value={"user_id": user_id})
    await notify(user_id, type="LOYALTY_UPDATED", title="Votre QR Code a été régénéré",
                 message="Le Bureau a régénéré votre QR Code d'engagement : l'ancien n'est plus valable.",
                 level="INFO", link="/loyalty")
    return await card_payload(user_id)


@router.post("/loyalty/manual")
async def manual_stamp(payload: ManualStampIn, admin: dict = Depends(require("loyalty.manage"))):
    """Ajout ou retrait manuel d'un tampon par le Bureau, motif obligatoire et tracé."""
    if payload.points == 0:
        raise HTTPException(status_code=400, detail="Indiquez un nombre de tampons différent de zéro")
    card = await ensure_card(payload.user_id)
    if payload.points < 0 and card["total_points"] + payload.points < 0:
        raise HTTPException(status_code=400,
                            detail=f"Impossible de retirer {abs(payload.points)} tampon(s) : "
                                   f"le total est de {card['total_points']}")
    source = "BUREAU_MANUAL" if payload.points > 0 else "BUREAU_REMOVAL"
    stamp = {
        "stamp_id": new_id("stamp"), "card_id": card["card_id"], "user_id": payload.user_id,
        "activity_id": None, "event_id": None,
        "activity_title": payload.label or ("Ajout manuel du Bureau" if payload.points > 0
                                            else "Retrait manuel du Bureau"),
        "rule_id": None, "points": payload.points, "comment": payload.reason,
        "reason": payload.reason, "source": source, "is_manual": True,
        "validated_by": admin["user_id"], "validated_by_name": await display_name(admin["user_id"]),
        "created_at": iso(now_utc()),
    }
    await db.loyalty_stamps.insert_one(dict(stamp))
    total = await recompute_total(card["card_id"])
    await log_action(admin, "STAMP_MANUAL", "loyalty", card["card_id"],
                     new_value={"points": payload.points, "motif": payload.reason})
    await notify(payload.user_id, type="LOYALTY_UPDATED",
                 title="Carte d'engagement mise à jour par le Bureau",
                 message=f"{'+' if payload.points > 0 else ''}{payload.points} tampon(s) — {payload.reason}. "
                         f"Total : {total}.",
                 level="INFO", resource_type="loyalty_card", resource_id=card["card_id"], link="/loyalty")
    return {"stamp": stamp, "total_points": total}


@router.delete("/loyalty/stamps/{stamp_id}")
async def cancel_stamp(stamp_id: str, reason: str, admin: dict = Depends(require("loyalty.manage"))):
    """Annulation d'une ligne précise de l'historique, motif obligatoire et tracé."""
    if len((reason or "").strip()) < 3:
        raise HTTPException(status_code=400, detail="Merci d'indiquer le motif de l'annulation")
    stamp = await db.loyalty_stamps.find_one({"stamp_id": stamp_id}, {"_id": 0})
    if not stamp:
        raise HTTPException(status_code=404, detail="Tampon introuvable")
    await db.loyalty_stamps.delete_one({"stamp_id": stamp_id})
    total = await recompute_total(stamp["card_id"])
    await log_action(admin, "STAMP_CANCELLED", "loyalty", stamp["card_id"],
                     old_value={"activité": stamp.get("activity_title"), "points": stamp.get("points")},
                     new_value={"motif": reason})
    await notify(stamp["user_id"], type="LOYALTY_UPDATED", title="Tampon annulé",
                 message=f"« {stamp.get('activity_title')} » a été annulé par le Bureau — {reason}. "
                         f"Total : {total}.",
                 level="WARNING", link="/loyalty")
    return {"ok": True, "total_points": total}


@router.get("/loyalty/stats")
async def engagement_stats(months: int = 6, admin: dict = Depends(require("loyalty.manage"))):
    """Statistiques d'engagement : classement, paliers atteints par mois, modes d'obtention."""
    stamps = await db.loyalty_stamps.find({}, {"_id": 0}).to_list(5000)
    rewards = await db.loyalty_rules.find({"kind": "REWARD", "is_active": True}, {"_id": 0}) \
        .sort("threshold", 1).to_list(50)

    by_member: dict = {}
    by_source: dict = {}
    by_month: dict = {}
    by_element: dict = {}
    for s in stamps:
        points = s.get("points", 0)
        member = by_member.setdefault(s["user_id"], {"points": 0, "stamps": 0, "last": None})
        member["points"] += points
        member["stamps"] += 1
        if not member["last"] or s["created_at"] > member["last"]:
            member["last"] = s["created_at"]
        source = s.get("source") or "PRO_VALIDATION"
        by_source[source] = by_source.get(source, 0) + 1
        month = (s.get("created_at") or "")[:7]
        if month:
            bucket = by_month.setdefault(month, {"points": 0, "stamps": 0, "members": set()})
            bucket["points"] += points
            bucket["stamps"] += 1
            bucket["members"].add(s["user_id"])
        title = s.get("activity_title") or "—"
        by_element[title] = by_element.get(title, 0) + 1

    ranking = []
    for user_id, data in by_member.items():
        total = max(data["points"], 0)
        reached = [r for r in rewards if (r.get("threshold") or 0) <= total]
        next_reward = next((r for r in rewards if (r.get("threshold") or 0) > total), None)
        ranking.append({"user_id": user_id, "display_name": await display_name(user_id),
                        "total_points": total, "stamps": data["stamps"],
                        "last_stamp": data["last"], "levels_reached": len(reached),
                        "next_reward": (next_reward or {}).get("reward")
                        or (next_reward or {}).get("label"),
                        "next_threshold": (next_reward or {}).get("threshold")})
    ranking.sort(key=lambda x: (-x["total_points"], x["display_name"] or ""))

    # Paliers atteints par mois : on rejoue l'historique de chaque membre dans l'ordre.
    levels_by_month: dict = {}
    for user_id in by_member:
        member_stamps = sorted([s for s in stamps if s["user_id"] == user_id],
                               key=lambda s: s.get("created_at") or "")
        running = 0
        for s in member_stamps:
            before = running
            running += s.get("points", 0)
            month = (s.get("created_at") or "")[:7]
            for r in rewards:
                threshold = r.get("threshold") or 0
                if before < threshold <= running and month:
                    entry = levels_by_month.setdefault(month, [])
                    entry.append({"user_id": user_id,
                                  "display_name": await display_name(user_id),
                                  "reward": r.get("reward") or r.get("label"),
                                  "threshold": threshold})

    keys = sorted(set(list(by_month) + list(levels_by_month)))[-months:]
    monthly = [{"month": k,
                "label": f"{k[5:7]}/{k[:4]}",
                "points": by_month.get(k, {}).get("points", 0),
                "stamps": by_month.get(k, {}).get("stamps", 0),
                "active_members": len(by_month.get(k, {}).get("members", set())),
                "levels_reached": len(levels_by_month.get(k, [])),
                "levels": levels_by_month.get(k, [])} for k in keys]

    total_members = await db.users.count_documents({"role": ROLE_MEMBER, "status": "ACTIVE"})
    return {
        "ranking": ranking[:20],
        "monthly": monthly,
        "by_source": [{"source": k, "label": SOURCE_LABELS.get(k, k), "count": v}
                      for k, v in sorted(by_source.items(), key=lambda x: -x[1])],
        "top_elements": [{"title": k, "count": v}
                         for k, v in sorted(by_element.items(), key=lambda x: -x[1])[:8]],
        "totals": {"stamps": len(stamps),
                   "points": sum(s.get("points", 0) for s in stamps),
                   "engaged_members": len(by_member), "active_members": total_members,
                   "participation_rate": round(len(by_member) / total_members * 100, 1)
                   if total_members else 0},
        "rewards": rewards,
    }


@router.get("/loyalty/monthly-recap")
async def my_monthly_recap(user: dict = Depends(require("loyalty.view_own"))):
    """Récapitulatif du mois écoulé pour l'adhérent connecté."""
    return await build_monthly_recap(user["user_id"])


async def build_monthly_recap(user_id: str) -> dict:
    card = await ensure_card(user_id)
    reference = now_utc()
    first_of_month = reference.replace(day=1)
    start = (first_of_month - timedelta(days=1)).replace(day=1)
    period_start, period_end = iso(start)[:10], iso(first_of_month)[:10]
    stamps = await db.loyalty_stamps.find(
        {"card_id": card["card_id"], "created_at": {"$gte": period_start, "$lt": period_end}},
        {"_id": 0}).sort("created_at", 1).to_list(200)
    rewards = await db.loyalty_rules.find({"kind": "REWARD", "is_active": True}, {"_id": 0}) \
        .sort("threshold", 1).to_list(50)
    total = card["total_points"]
    next_reward = next((r for r in rewards if (r.get("threshold") or 0) > total), None)
    return {
        "user_id": user_id, "display_name": await display_name(user_id),
        "period": {"start": period_start, "end": period_end,
                   "label": f"{start.month:02d}/{start.year}"},
        "stamps": stamps, "gained": sum(s.get("points", 0) for s in stamps),
        "total_points": total,
        "next_reward": next_reward,
        "missing": ((next_reward.get("threshold") or 0) - total) if next_reward else 0,
        "reached": [r for r in rewards if (r.get("threshold") or 0) <= total],
    }


# ---------------------------------------------------------------- Règles (Bureau)
@router.get("/loyalty/rules")
async def list_rules(user: dict = Depends(active_user)):
    if not (rbac.has_permission(user, "loyalty.manage") or rbac.has_permission(user, "loyalty.stamp")
            or rbac.has_permission(user, "loyalty.view_own")):
        raise HTTPException(status_code=403, detail="Accès refusé")
    query = {} if rbac.has_permission(user, "loyalty.manage") else {"is_active": True}
    rules = await db.loyalty_rules.find(query, {"_id": 0}).sort("created_at", 1).to_list(200)
    activity_ids = [r["activity_id"] for r in rules if r.get("activity_id")]
    titles = {a["activity_id"]: a["title"] async for a in db.activities.find(
        {"activity_id": {"$in": activity_ids}}, {"_id": 0, "activity_id": 1, "title": 1})}
    for r in rules:
        r["activity_title"] = titles.get(r.get("activity_id"))
    return {"items": rules, "card_types": CARD_TYPES}


@router.post("/loyalty/rules")
async def create_rule(payload: RuleIn, admin: dict = Depends(require("loyalty.manage"))):
    if payload.kind not in ("STAMP", "REWARD"):
        raise HTTPException(status_code=400, detail="Type de règle invalide")
    if payload.kind == "STAMP" and not (payload.activity_id or payload.activity_category):
        raise HTTPException(status_code=400, detail="Indiquez une activité ou une catégorie éligible")
    if payload.kind == "REWARD" and not payload.threshold:
        raise HTTPException(status_code=400, detail="Indiquez le seuil de points de la récompense")
    doc = {"rule_id": new_id("rule"), **payload.model_dump(),
           "created_by": admin["user_id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.loyalty_rules.insert_one(doc)
    if payload.kind == "STAMP" and payload.activity_id:
        await db.activities.update_one({"activity_id": payload.activity_id},
                                      {"$set": {"eligible_for_loyalty": True,
                                                "loyalty_points": payload.points}})
    await log_action(admin, "CREATE", "loyalty", doc["rule_id"], new_value={"label": payload.label})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/loyalty/rules/{rule_id}")
async def update_rule(rule_id: str, payload: dict, admin: dict = Depends(require("loyalty.manage"))):
    rule = await db.loyalty_rules.find_one({"rule_id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    allowed = {"label", "points", "threshold", "reward", "is_active", "validity_days",
               "activity_id", "activity_category", "card_types"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.loyalty_rules.update_one({"rule_id": rule_id}, {"$set": updates})
    if rule.get("activity_id") and "is_active" in updates:
        await db.activities.update_one({"activity_id": rule["activity_id"]},
                                      {"$set": {"eligible_for_loyalty": bool(updates["is_active"])}})
    await log_action(admin, "UPDATE", "loyalty", rule_id,
                     old_value={k: rule.get(k) for k in updates}, new_value=updates)
    return await db.loyalty_rules.find_one({"rule_id": rule_id}, {"_id": 0})


@router.delete("/loyalty/rules/{rule_id}")
async def delete_rule(rule_id: str, admin: dict = Depends(require_admin)):
    rule = await db.loyalty_rules.find_one({"rule_id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    await db.loyalty_rules.update_one({"rule_id": rule_id}, {"$set": {"is_active": False}})
    await log_action(admin, "ARCHIVE", "loyalty", rule_id)
    return {"ok": True}


# ---------------------------------------------------------------- Scan & tampons (professionnels autorisés)
async def member_summary(user_id: str) -> dict:
    card = await ensure_card(user_id)
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0, "display_name": 1, "city": 1})
    dogs = await db.dogs.find({"owner_id": user_id}, {"_id": 0, "name": 1}).to_list(10)
    eligible = await eligible_activities(user_id)
    events = await db.events.find({"eligible_for_loyalty": True,
                                   "status": {"$in": ["PLANNED", "CONFIRMED", "DONE"]}},
                                  {"_id": 0, "event_id": 1, "title": 1, "start_date": 1,
                                   "loyalty_points": 1}).sort("start_date", -1).limit(40).to_list(40)
    stamped = {s.get("activity_id") or s.get("event_id")
               async for s in db.loyalty_stamps.find({"card_id": card["card_id"]},
                                                     {"_id": 0, "activity_id": 1, "event_id": 1})}
    for a in eligible:
        a["already_stamped"] = a["activity_id"] in stamped
    return {"user_id": user_id, "card_id": card["card_id"], "display_name": (profile or {}).get("display_name"),
            "city": (profile or {}).get("city"), "dogs": [d["name"] for d in dogs],
            "total_points": card["total_points"], "card_type": card["card_type"],
            "eligible_activities": eligible,
            "eligible_events": [{"event_id": e["event_id"], "title": e["title"], "date": e.get("start_date"),
                                 "points": e.get("loyalty_points") or 1,
                                 "already_stamped": e["event_id"] in stamped} for e in events]}


async def eligible_activities(user_id: str) -> List[dict]:
    rules = await db.loyalty_rules.find({"kind": "STAMP", "is_active": True}, {"_id": 0}).to_list(200)
    activity_ids = [r["activity_id"] for r in rules if r.get("activity_id")]
    categories = [r["activity_category"] for r in rules if r.get("activity_category")]
    query = {"$or": [{"activity_id": {"$in": activity_ids}}, {"category": {"$in": categories}}],
             "status": {"$in": ["PLANNED", "ACTIVE", "FULL", "DONE"]}}
    activities = await db.activities.find(query, {"_id": 0}).sort("date", -1).limit(60).to_list(60)
    registered = {p["activity_id"] async for p in db.participations.find(
        {"user_id": user_id, "activity_id": {"$ne": None}}, {"_id": 0, "activity_id": 1})}
    result = []
    for a in activities:
        rule = next((r for r in rules if r.get("activity_id") == a["activity_id"]), None) \
            or next((r for r in rules if r.get("activity_category") == a["category"]), None)
        result.append({"activity_id": a["activity_id"], "title": a["title"], "date": a.get("date"),
                       "category": a["category"], "points": (rule or {}).get("points", 1),
                       "rule_id": (rule or {}).get("rule_id"), "is_registered": a["activity_id"] in registered})
    return result


@router.post("/loyalty/scan")
async def scan(payload: dict, user: dict = Depends(require("loyalty.stamp"))):
    token = (payload or {}).get("qr_token")
    if not token:
        raise HTTPException(status_code=400, detail="QR code illisible")
    card = await db.loyalty_cards.find_one({"qr_token": token}, {"_id": 0})
    if not card:
        raise HTTPException(status_code=404, detail="Carte inconnue ou QR périmé")
    if card["status"] != "ACTIVE":
        raise HTTPException(status_code=400, detail="Cette carte n'est pas active")
    await log_action(user, "SCAN", "loyalty", card["card_id"])
    return await member_summary(card["user_id"])


@router.get("/loyalty/eligible")
async def eligible_catalog(user: dict = Depends(require("loyalty.stamp"))):
    """Activités / événements éligibles, pré-chargés pour le scan hors connexion."""
    acts = await eligible_activities(None)
    events = await db.events.find({"eligible_for_loyalty": True, "status": {"$in": ["PLANNED", "CONFIRMED", "DONE"]}},
                                  {"_id": 0, "event_id": 1, "title": 1, "start_date": 1, "loyalty_points": 1}) \
        .sort("start_date", -1).limit(40).to_list(40)
    return {"eligible_activities": [{**a, "already_stamped": False} for a in acts],
            "eligible_events": [{"event_id": e["event_id"], "title": e["title"], "date": e.get("start_date"),
                                 "points": e.get("loyalty_points") or 1, "already_stamped": False} for e in events]}


@router.get("/loyalty/search")
async def manual_search(q: str, user: dict = Depends(require("loyalty.stamp"))):
    if len(q) < 2:
        return {"items": []}
    rx = {"$regex": q, "$options": "i"}
    matches = {}
    async for p in db.profiles.find({"$or": [{"display_name": rx}, {"first_name": rx}, {"last_name": rx}]},
                                    {"_id": 0, "user_id": 1}):
        matches[p["user_id"]] = True
    async for d in db.dogs.find({"name": rx}, {"_id": 0, "owner_id": 1}):
        matches[d["owner_id"]] = True
    async for c in db.loyalty_cards.find({"card_id": rx}, {"_id": 0, "user_id": 1}):
        matches[c["user_id"]] = True
    items = []
    for user_id in list(matches)[:10]:
        target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "role": 1, "status": 1})
        if target and target["role"] == ROLE_MEMBER and target["status"] == "ACTIVE":
            items.append(await member_summary(user_id))
    return {"items": items}


@router.post("/loyalty/stamp")
async def add_stamp(payload: StampIn, user: dict = Depends(require("loyalty.stamp"))):
    if payload.qr_token:
        card = await db.loyalty_cards.find_one({"qr_token": payload.qr_token}, {"_id": 0})
        if not card:
            raise HTTPException(status_code=404, detail="Carte inconnue")
        source = "QR_SCAN_OFFLINE" if payload.offline else "QR_SCAN"
    elif payload.user_id:
        target = await db.users.find_one({"user_id": payload.user_id}, {"_id": 0, "role": 1, "status": 1})
        if not target or target["role"] != ROLE_MEMBER or target["status"] != "ACTIVE":
            raise HTTPException(status_code=404, detail="Adhérent introuvable")
        card = await ensure_card(payload.user_id)
        source = "PRO_VALIDATION_OFFLINE" if payload.offline else "PRO_VALIDATION"
    else:
        raise HTTPException(status_code=400, detail="Indiquez un QR code ou un adhérent")

    if payload.event_id:
        event = await db.events.find_one({"event_id": payload.event_id}, {"_id": 0})
        if not event:
            raise HTTPException(status_code=404, detail="Événement introuvable")
        if not event.get("eligible_for_loyalty"):
            raise HTTPException(status_code=400,
                                detail="Cet événement n'est pas éligible à la carte d'engagement")
        if await db.loyalty_stamps.find_one({"card_id": card["card_id"], "event_id": payload.event_id}):
            raise HTTPException(status_code=400, detail="Un tampon a déjà été ajouté pour cet événement")
        points = int(event.get("loyalty_points") or 1)
        stamp = {
            "stamp_id": new_id("stamp"), "card_id": card["card_id"], "user_id": card["user_id"],
            "activity_id": None, "event_id": payload.event_id, "activity_title": event["title"],
            "rule_id": None, "points": points, "comment": payload.comment, "reason": None,
            "source": source, "is_manual": False,
            "validated_by": user["user_id"], "validated_by_name": await display_name(user["user_id"]),
            "created_at": payload.scanned_at or iso(now_utc()),
            "synced_at": iso(now_utc()) if payload.offline else None,
        }
    else:
        if not payload.activity_id:
            raise HTTPException(status_code=400, detail="Indiquez une activité ou un événement")
        activity = await db.activities.find_one({"activity_id": payload.activity_id}, {"_id": 0})
        if not activity:
            raise HTTPException(status_code=404, detail="Activité introuvable")
        rule = await db.loyalty_rules.find_one(
            {"kind": "STAMP", "is_active": True,
             "$or": [{"activity_id": payload.activity_id},
                     {"activity_category": activity["category"]}]}, {"_id": 0})
        if not rule and not activity.get("eligible_for_loyalty"):
            raise HTTPException(status_code=400,
                                detail="Cette activité n'est pas éligible : le Bureau doit d'abord "
                                       "la marquer éligible ou créer une règle")
        if rule and card["card_type"] not in (rule.get("card_types") or ["STANDARD"]):
            raise HTTPException(status_code=400, detail="Type de carte non concerné par cette règle")
        if await db.loyalty_stamps.find_one({"card_id": card["card_id"],
                                             "activity_id": payload.activity_id}):
            raise HTTPException(status_code=400, detail="Un tampon a déjà été ajouté pour cette activité")
        points = int((rule or {}).get("points") or activity.get("loyalty_points") or 1)
        stamp = {
            "stamp_id": new_id("stamp"), "card_id": card["card_id"], "user_id": card["user_id"],
            "activity_id": payload.activity_id, "event_id": None,
            "activity_title": activity["title"], "rule_id": (rule or {}).get("rule_id"),
            "points": points, "comment": payload.comment, "reason": None,
            "source": source, "is_manual": False,
            "validated_by": user["user_id"], "validated_by_name": await display_name(user["user_id"]),
            "created_at": payload.scanned_at or iso(now_utc()),
            "synced_at": iso(now_utc()) if payload.offline else None,
        }

    await db.loyalty_stamps.insert_one(dict(stamp))
    new_total = await recompute_total(card["card_id"])
    await log_action(user, "STAMP", "loyalty", card["card_id"],
                     new_value={"element": stamp["activity_title"], "points": points, "source": source})
    await notify(card["user_id"], type="LOYALTY_UPDATED", title="Carte d'engagement mise à jour",
                 message=f"+{points} tampon(s) pour « {stamp['activity_title']} ». Total : {new_total}.",
                 level="SUCCESS", resource_type="loyalty_card", resource_id=card["card_id"], link="/loyalty")
    reward = await db.loyalty_rules.find_one({"kind": "REWARD", "is_active": True,
                                              "threshold": {"$lte": new_total}},
                                             {"_id": 0}, sort=[("threshold", -1)])
    if reward and (new_total - points) < (reward.get("threshold") or 0) <= new_total:
        await notify(card["user_id"], type="ADVANTAGE_AVAILABLE", title="Palier atteint",
                     message=f"{reward['reward'] or reward['label']} — {reward['threshold']} tampons atteints !",
                     level="SUCCESS", resource_type="loyalty_card", resource_id=card["card_id"],
                     link="/loyalty")
    return {"stamp": stamp, "total_points": new_total, "reward_reached": bool(reward)}


async def auto_stamp(user_id: str, validator: dict, activity: dict = None, event: dict = None):
    """Tampon automatique lors de la validation d'une présence sur un élément éligible."""
    element = activity or event
    if not element or not element.get("eligible_for_loyalty"):
        return None
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "role": 1, "status": 1})
    if not target or target["role"] != ROLE_MEMBER:
        return None
    card = await ensure_card(user_id)
    key = "activity_id" if activity else "event_id"
    element_id = element.get(key)
    if await db.loyalty_stamps.find_one({"card_id": card["card_id"], key: element_id}):
        return None
    points = int(element.get("loyalty_points") or 1)
    stamp = {
        "stamp_id": new_id("stamp"), "card_id": card["card_id"], "user_id": user_id,
        "activity_id": element_id if activity else None, "event_id": element_id if event else None,
        "activity_title": element["title"], "rule_id": None, "points": points,
        "comment": "Présence validée", "reason": None, "source": "AUTO_PARTICIPATION",
        "is_manual": False, "validated_by": validator["user_id"],
        "validated_by_name": await display_name(validator["user_id"]), "created_at": iso(now_utc()),
    }
    await db.loyalty_stamps.insert_one(dict(stamp))
    total = await recompute_total(card["card_id"])
    await log_action(validator, "STAMP", "loyalty", card["card_id"],
                     new_value={"element": element["title"], "points": points,
                                "source": "AUTO_PARTICIPATION"})
    await notify(user_id, type="LOYALTY_UPDATED", title="Tampon d'engagement ajouté",
                 message=f"+{points} tampon(s) pour « {element['title']} ». Total : {total}.",
                 level="SUCCESS", resource_type="loyalty_card", resource_id=card["card_id"],
                 link="/loyalty")
    return stamp


@router.get("/loyalty/history")
async def history(user_id: Optional[str] = None, activity_id: Optional[str] = None,
                  event_id: Optional[str] = None, source: Optional[str] = None,
                  date_from: Optional[str] = None, date_to: Optional[str] = None,
                  q: Optional[str] = None, sort: str = "date", limit: int = 200,
                  user: dict = Depends(active_user)):
    if user_id and user_id != user["user_id"]:
        if not (rbac.has_permission(user, "loyalty.manage") or rbac.has_permission(user, "loyalty.stamp")):
            raise HTTPException(status_code=403, detail="Accès refusé")
        query = {"user_id": user_id}
    elif rbac.has_permission(user, "loyalty.manage") and not user_id:
        query = {}
    else:
        query = {"user_id": user["user_id"]}
    if activity_id:
        query["activity_id"] = activity_id
    if event_id:
        query["event_id"] = event_id
    if source:
        query["source"] = source
    if date_from or date_to:
        query["created_at"] = {}
        if date_from:
            query["created_at"]["$gte"] = date_from
        if date_to:
            query["created_at"]["$lte"] = f"{date_to}T23:59:59"
    items = await db.loyalty_stamps.find(query, {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000)
    for s in items:
        s["member_name"] = await display_name(s["user_id"])
        s["source_label"] = SOURCE_LABELS.get(s.get("source") or "PRO_VALIDATION",
                                              "Validation par un professionnel")
    if q:
        needle = q.lower()
        items = [s for s in items
                 if needle in (s.get("member_name") or "").lower()
                 or needle in (s.get("activity_title") or "").lower()]
    if sort == "member":
        items.sort(key=lambda s: (s.get("member_name") or "").lower())
    elif sort == "activity":
        items.sort(key=lambda s: (s.get("activity_title") or "").lower())
    return {"items": items[:limit], "total": len(items), "source_labels": SOURCE_LABELS,
            "total_points": sum(s.get("points", 0) for s in items)}


@router.get("/loyalty/members")
async def engagement_members(page: int = 1, limit: int = 50, status: Optional[str] = None,
                             level: Optional[int] = None, recent: bool = False,
                             admin: dict = Depends(require("loyalty.manage"))):
    """Vue Bureau paginée (50 max/page) : Particuliers avec total de tampons et palier.
    Pagination par décalage côté base ; filtres appliqués AVANT la pagination."""
    limit = min(max(limit, 1), 50)
    rewards = await db.loyalty_rules.find({"kind": "REWARD", "is_active": True}, {"_id": 0}) \
        .sort("threshold", 1).to_list(50)
    user_query = {"role": ROLE_MEMBER, "status": status or "ACTIVE"}
    if level or recent:
        card_q = {}
        if level:
            card_q["total_points"] = {"$gte": int(level)}
        if recent:
            card_q["updated_at"] = {"$gte": iso(now_utc() - timedelta(days=30))}
        qualifying = [c["user_id"] async for c in db.loyalty_cards.find(card_q, {"_id": 0, "user_id": 1})]
        user_query["user_id"] = {"$in": qualifying}
    total = await db.users.count_documents(user_query)
    users = await db.users.find(user_query, {"_id": 0, "user_id": 1, "email": 1}) \
        .sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    items = []
    for u in users:
        card = await db.loyalty_cards.find_one({"user_id": u["user_id"]}, {"_id": 0}) \
            or {"total_points": 0, "card_id": None, "qr_token": None}
        total_pts = card.get("total_points", 0)
        next_reward = next((r for r in rewards if (r.get("threshold") or 0) > total_pts), None)
        items.append({"user_id": u["user_id"], "email": u["email"],
                      "display_name": await display_name(u["user_id"]),
                      "card_id": card.get("card_id"), "qr_token": card.get("qr_token"),
                      "total_points": total_pts,
                      "stamps_count": await db.loyalty_stamps.count_documents({"card_id": card.get("card_id")})
                      if card.get("card_id") else 0,
                      "next_reward": next_reward,
                      "progress": round(total_pts / next_reward["threshold"] * 100, 1) if next_reward else 100})
    items.sort(key=lambda x: -x["total_points"])
    return {"items": items, "total": total, "page": page, "limit": limit,
            "pages": max((total + limit - 1) // limit, 1), "rewards": rewards}
