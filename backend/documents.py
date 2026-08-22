"""Phase 7 — Contrats & documents officiels, formulaires externes, historique élargi."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify_bureau, display_name)
from content import manager_user, is_manager
from storage import file_meta

router = APIRouter(prefix="/api")

DOCUMENT_CATEGORIES = ["CONTRAT", "CONVENTION", "STATUTS", "ASSURANCE", "ADMINISTRATIF",
                       "PROCES_VERBAL", "SUBVENTION", "AUTRE"]
CATEGORY_LABELS = {"CONTRAT": "Contrat", "CONVENTION": "Convention", "STATUTS": "Statuts",
                   "ASSURANCE": "Assurance", "ADMINISTRATIF": "Administratif",
                   "PROCES_VERBAL": "Procès-verbal", "SUBVENTION": "Subvention", "AUTRE": "Autre"}
PROOF_TYPES = ["FACTURE", "RECU", "DEVIS", "ATTESTATION", "CONTRAT_SIGNE", "COMPTE_RENDU",
               "PHOTO", "AUTRE"]
PROOF_LABELS = {"FACTURE": "Facture", "RECU": "Reçu", "DEVIS": "Devis",
                "ATTESTATION": "Attestation", "CONTRAT_SIGNE": "Contrat signé",
                "COMPTE_RENDU": "Compte-rendu", "PHOTO": "Photo", "AUTRE": "Autre"}
DOCUMENT_VISIBILITIES = ["BUREAU", "PRO_BUREAU", "SHARED"]
VISIBILITY_LABELS = {"BUREAU": "Bureau seul", "PRO_BUREAU": "Professionnels + Bureau",
                     "SHARED": "Partagé avec des membres désignés"}
DOCUMENT_STATUSES = ["EN_COURS", "SIGNE", "EXPIRE", "A_RENOUVELER", "ARCHIVE"]
FORM_USAGES = ["RETOUR_ACTIVITE", "AJOUT_CHIEN", "CANDIDATURE_BENEVOLE", "SONDAGE", "AUTRE"]
ROLES = ["ADMIN_BUREAU", "PROFESSIONNEL", "PARTICULIER"]
HISTORY_SCOPES = ["OWN", "MODULE", "FULL"]


class DocumentIn(BaseModel):
    title: str = Field(min_length=2)
    category: str = "AUTRE"
    date: Optional[str] = None
    status: str = "EN_COURS"
    expiry_date: Optional[str] = None
    file_id: Optional[str] = None
    partner_id: Optional[str] = None
    project_id: Optional[str] = None
    terrain_id: Optional[str] = None
    notes: Optional[str] = None
    shared_with_user_ids: List[str] = []
    proof_type: str = "AUTRE"
    visibility: str = "BUREAU"


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    status: Optional[str] = None
    expiry_date: Optional[str] = None
    file_id: Optional[str] = None
    partner_id: Optional[str] = None
    project_id: Optional[str] = None
    terrain_id: Optional[str] = None
    notes: Optional[str] = None
    shared_with_user_ids: Optional[List[str]] = None
    proof_type: Optional[str] = None
    visibility: Optional[str] = None


class DocumentCategoryIn(BaseModel):
    label: str = Field(min_length=2)


class FormIn(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = None
    url: str
    usage: str = "AUTRE"
    activity_id: Optional[str] = None
    event_id: Optional[str] = None
    allowed_roles: List[str] = ["ADMIN_BUREAU"]
    allowed_levels: List[str] = []
    extra_user_ids: List[str] = []


class FormUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    usage: Optional[str] = None
    activity_id: Optional[str] = None
    event_id: Optional[str] = None
    allowed_roles: Optional[List[str]] = None
    allowed_levels: Optional[List[str]] = None
    extra_user_ids: Optional[List[str]] = None
    status: Optional[str] = None


async def all_document_categories() -> List[str]:
    custom = await db.document_categories.find({}, {"_id": 0, "code": 1}).to_list(100)
    return DOCUMENT_CATEGORIES + [c["code"] for c in custom]


async def document_labels() -> dict:
    custom = await db.document_categories.find({}, {"_id": 0}).to_list(100)
    return {**CATEGORY_LABELS, **{c["code"]: c["label"] for c in custom}}


# ---------------------------------------------------------------- Documents officiels
@router.get("/documents/meta")
async def documents_meta(user: dict = Depends(require("documents.view"))):
    custom = await db.document_categories.find({}, {"_id": 0}).to_list(100)
    return {"categories": await all_document_categories(), "category_labels": await document_labels(),
            "custom_categories": custom, "statuses": DOCUMENT_STATUSES,
            "proof_types": PROOF_TYPES, "proof_labels": PROOF_LABELS,
            "visibilities": DOCUMENT_VISIBILITIES, "visibility_labels": VISIBILITY_LABELS,
            "form_usages": FORM_USAGES, "roles": ROLES, "is_manager": await is_manager(user)}


@router.post("/documents/categories")
async def create_document_category(payload: DocumentCategoryIn, admin: dict = Depends(require_admin)):
    code = "".join(c if c.isalnum() else "_" for c in payload.label.upper())[:40]
    if code in await all_document_categories():
        raise HTTPException(status_code=400, detail="Cette catégorie existe déjà")
    doc = {"doc_category_id": new_id("dcat"), "code": code, "label": payload.label,
           "created_by": admin["user_id"], "created_at": iso(now_utc())}
    await db.document_categories.insert_one(dict(doc))
    await log_action(admin, "CREATE", "documents", doc["doc_category_id"],
                     new_value={"label": payload.label})
    return doc


@router.put("/documents/categories/{doc_category_id}")
async def update_document_category(doc_category_id: str, payload: DocumentCategoryIn,
                                   admin: dict = Depends(require_admin)):
    category = await db.document_categories.find_one({"doc_category_id": doc_category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    await db.document_categories.update_one({"doc_category_id": doc_category_id},
                                            {"$set": {"label": payload.label,
                                                      "updated_at": iso(now_utc())}})
    await log_action(admin, "UPDATE", "documents", doc_category_id,
                     old_value={"label": category["label"]}, new_value={"label": payload.label})
    return {**category, "label": payload.label}


@router.delete("/documents/categories/{doc_category_id}")
async def delete_document_category(doc_category_id: str, admin: dict = Depends(require_admin)):
    category = await db.document_categories.find_one({"doc_category_id": doc_category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    used = await db.documents.count_documents({"category": category["code"]})
    if used:
        raise HTTPException(status_code=400,
                            detail=f"{used} document(s) utilisent encore cette catégorie")
    await db.document_categories.delete_one({"doc_category_id": doc_category_id})
    await log_action(admin, "DELETE", "documents", doc_category_id)
    return {"ok": True}


@router.get("/documents")
async def list_documents(category: Optional[str] = None, status: Optional[str] = None,
                         proof_type: Optional[str] = None, q: Optional[str] = None,
                         user: dict = Depends(require("documents.view"))):
    manager = await is_manager(user)
    filters = [{"status": {"$ne": "ARCHIVE"}}]
    if not manager:
        visible = [{"shared_with_user_ids": user["user_id"]}]
        if user["role"] == "PROFESSIONNEL":
            visible.append({"visibility": "PRO_BUREAU"})
        filters.append({"$or": visible})
    if category:
        filters.append({"category": category})
    if status:
        filters.append({"status": status})
    if proof_type:
        filters.append({"proof_type": proof_type})
    if q:
        filters.append({"title": {"$regex": q, "$options": "i"}})
    items = await db.documents.find({"$and": filters}, {"_id": 0}).sort("date", -1).to_list(300)
    labels = await document_labels()
    today = iso(now_utc())[:10]
    for doc in items:
        doc["file"] = await file_meta(doc.get("file_id"))
        doc["category_label"] = labels.get(doc.get("category"), doc.get("category"))
        doc["proof_label"] = PROOF_LABELS.get(doc.get("proof_type") or "AUTRE", "Autre")
        doc["visibility_label"] = VISIBILITY_LABELS.get(doc.get("visibility") or "BUREAU",
                                                        "Bureau seul")
        doc["is_expiring"] = bool(doc.get("expiry_date") and doc["expiry_date"] >= today
                                  and doc["expiry_date"] <= _plus_30())
        doc["is_expired"] = bool(doc.get("expiry_date") and doc["expiry_date"] < today)
    return {"items": items, "total": len(items), "is_manager": manager,
            "category_labels": labels, "proof_labels": PROOF_LABELS,
            "visibility_labels": VISIBILITY_LABELS,
            "expiring_count": len([d for d in items if d["is_expiring"]]),
            "expired_count": len([d for d in items if d["is_expired"]])}


def _plus_30() -> str:
    from datetime import timedelta
    return iso(now_utc() + timedelta(days=30))[:10]


@router.post("/documents")
async def create_document(payload: DocumentIn, admin: dict = Depends(require("documents.upload"))):
    if payload.category not in await all_document_categories():
        raise HTTPException(status_code=400, detail="Catégorie de document invalide")
    if payload.proof_type not in PROOF_TYPES:
        raise HTTPException(status_code=400, detail="Type de preuve invalide")
    if payload.visibility not in DOCUMENT_VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    if payload.status not in DOCUMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de document invalide")
    if admin["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Seul le Bureau dépose un document officiel")
    meta = await file_meta(payload.file_id)
    if not meta:
        raise HTTPException(status_code=400, detail="Envoyez d'abord le fichier (PDF ou texte)")
    if meta["content_type"] not in ("application/pdf", "text/plain", "text/csv"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF et texte sont acceptés")
    doc = {"document_id": new_id("doc"), **payload.model_dump(),
           "date": payload.date or iso(now_utc())[:10], "reminder_sent": False,
           "created_by": admin["user_id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.documents.insert_one(dict(doc))
    await log_action(admin, "CREATE", "documents", doc["document_id"], new_value={"title": payload.title})
    return doc


@router.put("/documents/{document_id}")
async def update_document(document_id: str, payload: DocumentUpdate, admin: dict = Depends(require_admin)):
    document = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates and updates["status"] not in DOCUMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de document invalide")
    if "category" in updates and updates["category"] not in await all_document_categories():
        raise HTTPException(status_code=400, detail="Catégorie de document invalide")
    if "proof_type" in updates and updates["proof_type"] not in PROOF_TYPES:
        raise HTTPException(status_code=400, detail="Type de preuve invalide")
    if "visibility" in updates and updates["visibility"] not in DOCUMENT_VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    if "expiry_date" in updates:
        updates["reminder_sent"] = False
    updates["updated_at"] = iso(now_utc())
    await db.documents.update_one({"document_id": document_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "documents", document_id, new_value=updates)
    return await db.documents.find_one({"document_id": document_id}, {"_id": 0})


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, reason: Optional[str] = None, hard: bool = False,
                          admin: dict = Depends(require_admin)):
    document = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document introuvable")
    if hard:
        await db.documents.delete_one({"document_id": document_id})
        await log_action(admin, "DELETE", "documents", document_id,
                         old_value={"titre": document["title"]},
                         new_value={"motif": reason, "definitif": True})
        return {"ok": True, "message": f"« {document['title']} » supprimé définitivement."}
    await db.documents.update_one({"document_id": document_id},
                                  {"$set": {"status": "ARCHIVE", "archive_reason": reason,
                                            "updated_at": iso(now_utc())}})
    await log_action(admin, "ARCHIVE", "documents", document_id, new_value={"motif": reason})
    return {"ok": True, "message": f"« {document['title']} » archivé, récupérable."}


# ---------------------------------------------------------------- Formulaires externes
@router.get("/forms")
async def list_forms(usage: Optional[str] = None, user: dict = Depends(require("forms.view"))):
    manager = await is_manager(user)
    filters = [{"status": {"$ne": "ARCHIVED"}}]
    if not manager:
        filters.append({"$or": [{"allowed_roles": user["role"]},
                                {"allowed_levels": user["access_level"]},
                                {"extra_user_ids": user["user_id"]}]})
    if usage:
        filters.append({"usage": usage})
    items = await db.external_forms.find({"$and": filters}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for form in items:
        if form.get("activity_id"):
            activity = await db.activities.find_one({"activity_id": form["activity_id"]},
                                                    {"_id": 0, "title": 1})
            form["activity_title"] = (activity or {}).get("title")
    return {"items": items, "total": len(items), "is_manager": manager}


@router.post("/forms")
async def create_form(payload: FormIn, admin: dict = Depends(require("forms.manage"))):
    if payload.usage not in FORM_USAGES:
        raise HTTPException(status_code=400, detail="Usage de formulaire invalide")
    if not payload.url.startswith("http"):
        raise HTTPException(status_code=400, detail="Le lien du formulaire doit commencer par http")
    bad = [r for r in payload.allowed_roles if r not in ROLES]
    if bad:
        raise HTTPException(status_code=400, detail=f"Rôle inconnu : {', '.join(bad)}")
    doc = {"form_id": new_id("frmx"), **payload.model_dump(), "status": "ACTIVE",
           "created_by": admin["user_id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.external_forms.insert_one(dict(doc))
    await log_action(admin, "CREATE", "forms", doc["form_id"], new_value={"title": payload.title})
    return doc


@router.put("/forms/{form_id}")
async def update_form(form_id: str, payload: FormUpdate, admin: dict = Depends(require("forms.manage"))):
    form = await db.external_forms.find_one({"form_id": form_id}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Formulaire introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "allowed_roles" in updates:
        bad = [r for r in updates["allowed_roles"] if r not in ROLES]
        if bad:
            raise HTTPException(status_code=400, detail=f"Rôle inconnu : {', '.join(bad)}")
    if "status" in updates and updates["status"] not in ("ACTIVE", "ARCHIVED"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    updates["updated_at"] = iso(now_utc())
    await db.external_forms.update_one({"form_id": form_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "forms", form_id, new_value=updates)
    return await db.external_forms.find_one({"form_id": form_id}, {"_id": 0})


@router.post("/forms/{form_id}/open")
async def trace_form_open(form_id: str, user: dict = Depends(require("forms.view"))):
    form = await db.external_forms.find_one({"form_id": form_id}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Formulaire introuvable")
    await db.form_openings.insert_one({
        "opening_id": new_id("fop"), "form_id": form_id, "form_title": form["title"],
        "user_id": user["user_id"], "user_name": await display_name(user["user_id"]),
        "created_at": iso(now_utc())})
    return {"ok": True, "url": form["url"]}


# ---------------------------------------------------------------- Historique des actions
@router.get("/history/me")
async def my_history(module: Optional[str] = None, limit: int = 150,
                     user: dict = Depends(require("audit.view_own"))):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0, "history_scope": 1})
    scope = (profile or {}).get("history_scope") or "OWN"
    if user["role"] == ROLE_ADMIN:
        scope = "FULL"
    query = {}
    if scope == "OWN":
        query["user_id"] = user["user_id"]
    elif scope == "MODULE":
        modules = ["projects", "tasks", "activities", "events", "articles", "formations",
                   "library", "social", "terrain"]
        query["module"] = {"$in": [module] if module else modules}
    if module and scope != "MODULE":
        query["module"] = module
    items = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"items": items, "total": len(items), "scope": scope}


@router.put("/history/scope/{user_id}")
async def set_history_scope(user_id: str, body: dict, admin: dict = Depends(require_admin)):
    scope = body.get("history_scope")
    if scope not in HISTORY_SCOPES:
        raise HTTPException(status_code=400, detail="Niveau de visibilité invalide (OWN, MODULE, FULL)")
    res = await db.profiles.update_one({"user_id": user_id},
                                       {"$set": {"history_scope": scope, "updated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    await log_action(admin, "UPDATE", "audit", user_id, new_value={"history_scope": scope})
    return {"ok": True, "history_scope": scope}
