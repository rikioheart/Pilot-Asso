"""Phase 7 — Partenariats & réseau externe (mairies, associations, partenaires commerciaux)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, display_name)
from content import manager_user, is_manager

router = APIRouter(prefix="/api")

PARTNER_CATEGORIES = ["MAIRIE", "ASSOCIATION", "COMMERCIAL"]
PARTNER_STATUSES = ["ACTIF", "DISCUSSION", "INACTIF", "ARCHIVE"]
SENSITIVE_FIELDS = ("siret", "contract_file_ids", "clauses", "internal_notes", "contact_email", "contact_phone")


class PartnerIn(BaseModel):
    name: str = Field(min_length=2)
    category: str
    partner_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_role: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    geographic_zone: Optional[str] = None
    partnership_nature: Optional[str] = None
    status: str = "DISCUSSION"
    company_name: Optional[str] = None
    siret: Optional[str] = None
    clauses: Optional[str] = None
    contract_file_ids: List[str] = []
    internal_notes: Optional[str] = None
    project_ids: List[str] = []
    event_ids: List[str] = []
    advantage_ids: List[str] = []
    logo_file_id: Optional[str] = None


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    partner_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_role: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    geographic_zone: Optional[str] = None
    partnership_nature: Optional[str] = None
    status: Optional[str] = None
    company_name: Optional[str] = None
    siret: Optional[str] = None
    clauses: Optional[str] = None
    contract_file_ids: Optional[List[str]] = None
    internal_notes: Optional[str] = None
    project_ids: Optional[List[str]] = None
    event_ids: Optional[List[str]] = None
    advantage_ids: Optional[List[str]] = None
    logo_file_id: Optional[str] = None


class ExchangeIn(BaseModel):
    date: Optional[str] = None
    channel: str = "EMAIL"
    summary: str = Field(min_length=2)
    next_step: Optional[str] = None


class AdvantageProposalIn(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = None
    kind: str = "SEANCE_PRO"
    conditions: Optional[str] = None
    valid_until: Optional[str] = None
    quantity: Optional[int] = None
    partner_id: Optional[str] = None


def public_partner(partner: dict) -> dict:
    return {k: v for k, v in partner.items() if k not in SENSITIVE_FIELDS}


@router.get("/partners/meta")
async def partners_meta(user: dict = Depends(require("partners.view"))):
    return {"categories": PARTNER_CATEGORIES, "statuses": PARTNER_STATUSES,
            "is_manager": await is_manager(user)}


@router.get("/partners")
async def list_partners(category: Optional[str] = None, status: Optional[str] = None,
                        q: Optional[str] = None, limit: int = 300,
                        user: dict = Depends(require("partners.view"))):
    manager = await is_manager(user)
    filters = [{"status": {"$ne": "ARCHIVE"}}]
    if not manager:
        filters = [{"status": "ACTIF"}]
    if category:
        filters.append({"category": category})
    if status and manager:
        filters = [f for f in filters if "status" not in f] + [{"status": status}]
    if q:
        filters.append({"$or": [{"name": {"$regex": q, "$options": "i"}},
                                {"company_name": {"$regex": q, "$options": "i"}},
                                {"geographic_zone": {"$regex": q, "$options": "i"}}]})
    items = await db.partners.find({"$and": filters}, {"_id": 0}).sort("name", 1).limit(limit).to_list(limit)
    if not manager:
        items = [public_partner(p) for p in items]
    return {"items": items, "total": len(items), "is_manager": manager}


@router.post("/partners")
async def create_partner(payload: PartnerIn, admin: dict = Depends(require("partners.edit"))):
    if payload.category not in PARTNER_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie de partenaire invalide")
    if payload.status not in PARTNER_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de partenaire invalide")
    doc = {"partner_id": new_id("prt"), **payload.model_dump(),
           "created_by": admin["user_id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.partners.insert_one(dict(doc))
    await log_action(admin, "CREATE", "partners", doc["partner_id"], new_value={"name": payload.name})
    return doc


@router.get("/partners/{partner_id}")
async def get_partner(partner_id: str, user: dict = Depends(require("partners.view"))):
    partner = await db.partners.find_one({"partner_id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partenaire introuvable")
    manager = await is_manager(user)
    if not manager:
        if partner["status"] != "ACTIF":
            raise HTTPException(status_code=403, detail="Cette fiche ne vous est pas accessible")
        partner = public_partner(partner)
    exchanges = []
    if manager:
        exchanges = await db.partner_exchanges.find({"partner_id": partner_id}, {"_id": 0}) \
            .sort("date", -1).to_list(200)
    advantages = await db.advantages.find({"partner_id": partner_id}, {"_id": 0}).to_list(50)
    return {"partner": partner, "exchanges": exchanges, "advantages": advantages, "is_manager": manager}


@router.put("/partners/{partner_id}")
async def update_partner(partner_id: str, payload: PartnerUpdate, admin: dict = Depends(require("partners.edit"))):
    partner = await db.partners.find_one({"partner_id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partenaire introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates and updates["status"] not in PARTNER_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de partenaire invalide")
    if "category" in updates and updates["category"] not in PARTNER_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie de partenaire invalide")
    updates["updated_at"] = iso(now_utc())
    await db.partners.update_one({"partner_id": partner_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "partners", partner_id,
                     old_value={k: partner.get(k) for k in updates}, new_value=updates)
    return await db.partners.find_one({"partner_id": partner_id}, {"_id": 0})


@router.delete("/partners/{partner_id}")
async def archive_partner(partner_id: str, admin: dict = Depends(require_admin)):
    res = await db.partners.update_one({"partner_id": partner_id},
                                       {"$set": {"status": "ARCHIVE", "updated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Partenaire introuvable")
    await log_action(admin, "ARCHIVE", "partners", partner_id)
    return {"ok": True}


@router.post("/partners/{partner_id}/exchanges")
async def add_exchange(partner_id: str, payload: ExchangeIn, admin: dict = Depends(require("partners.edit"))):
    if not await db.partners.find_one({"partner_id": partner_id}):
        raise HTTPException(status_code=404, detail="Partenaire introuvable")
    doc = {"exchange_id": new_id("exc"), "partner_id": partner_id,
           "date": payload.date or iso(now_utc())[:10], "channel": payload.channel,
           "summary": payload.summary, "next_step": payload.next_step,
           "author_id": admin["user_id"], "author_name": await display_name(admin["user_id"]),
           "created_at": iso(now_utc())}
    await db.partner_exchanges.insert_one(dict(doc))
    await log_action(admin, "CREATE", "partners", partner_id, new_value={"exchange": payload.summary[:80]})
    return doc


# ---------------------------------------------------------------- Propositions d'avantages (pros)
@router.get("/partner-proposals")
async def list_proposals(status: Optional[str] = None, user: dict = Depends(active_user)):
    manager = await is_manager(user)
    query = {} if manager else {"proposed_by": user["user_id"]}
    if status:
        query["status"] = status
    items = await db.advantage_proposals.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items, "total": len(items), "is_manager": manager}


@router.post("/partner-proposals")
async def propose_advantage(payload: AdvantageProposalIn, user: dict = Depends(require("partners.view"))):
    doc = {"proposal_id": new_id("prp"), **payload.model_dump(), "status": "PENDING",
           "review_comment": None, "reviewed_by": None, "advantage_id": None,
           "proposed_by": user["user_id"], "proposed_by_name": await display_name(user["user_id"]),
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.advantage_proposals.insert_one(dict(doc))
    await log_action(user, "CREATE", "partners", doc["proposal_id"], new_value={"title": payload.title})
    await notify_bureau(type="ADVANTAGE_PROPOSED", title="Avantage proposé par un professionnel",
                        message=f"{doc['proposed_by_name']} propose « {payload.title} ».", level="ACTION",
                        resource_type="advantage_proposal", resource_id=doc["proposal_id"], link="/partners")
    return doc


@router.post("/partner-proposals/{proposal_id}/review")
async def review_proposal(proposal_id: str, body: dict, admin: dict = Depends(manager_user)):
    proposal = await db.advantage_proposals.find_one({"proposal_id": proposal_id}, {"_id": 0})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    decision = body.get("decision")
    if decision not in ("ACCEPT", "REFUSE"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    advantage_id = None
    if decision == "ACCEPT":
        advantage_id = new_id("adv")
        await db.advantages.insert_one({
            "advantage_id": advantage_id, "title": proposal["title"],
            "description": proposal.get("description"), "kind": proposal.get("kind") or "SEANCE_PRO",
            "promo_code": None, "partner_name": None, "professional_id": proposal["proposed_by"],
            "conditions": proposal.get("conditions"), "valid_from": iso(now_utc())[:10],
            "valid_until": proposal.get("valid_until"), "quantity": proposal.get("quantity"),
            "access_level": "MEMBERS", "cover_file_id": None, "activity_id": None,
            "partner_id": proposal.get("partner_id"), "stock_item_id": None,
            "status": "ACTIVE", "used_count": 0, "created_by": admin["user_id"],
            "created_at": iso(now_utc()), "updated_at": iso(now_utc())})
    await db.advantage_proposals.update_one({"proposal_id": proposal_id}, {"$set": {
        "status": "ACCEPTED" if decision == "ACCEPT" else "REFUSED",
        "review_comment": body.get("comment"), "reviewed_by": admin["user_id"],
        "advantage_id": advantage_id, "updated_at": iso(now_utc())}})
    await log_action(admin, "REVIEW", "partners", proposal_id, new_value={"decision": decision})
    await notify(proposal["proposed_by"], type="ADVANTAGE_PROPOSAL_REVIEWED",
                 title="Avantage accepté" if decision == "ACCEPT" else "Avantage refusé",
                 message=body.get("comment") or f"« {proposal['title']} » : décision du Bureau enregistrée.",
                 level="SUCCESS" if decision == "ACCEPT" else "WARNING",
                 resource_type="advantage_proposal", resource_id=proposal_id, link="/advantages")
    return await db.advantage_proposals.find_one({"proposal_id": proposal_id}, {"_id": 0})
