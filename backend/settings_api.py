"""Paramètres de l'association : charte graphique, critères, messages (association_settings)."""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, iso, now_utc, new_id, require_admin, active_user, log_action

router = APIRouter(prefix="/api")

DEFAULT_THEME = {
    "primary": "#800020", "primary_dark": "#63001a", "dark": "#002060",
    "surface": "#ffffff", "surface_alt": "#f4f6f8",
    "status_ok": "#1e7f4f", "status_warn": "#c2701a", "status_error": "#b3261e",
}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class ThemeIn(BaseModel):
    primary: Optional[str] = None
    primary_dark: Optional[str] = None
    dark: Optional[str] = None
    surface: Optional[str] = None
    surface_alt: Optional[str] = None
    status_ok: Optional[str] = None
    status_warn: Optional[str] = None
    status_error: Optional[str] = None


async def get_setting(key: str, default: dict) -> dict:
    doc = await db.association_settings.find_one({"key": key}, {"_id": 0, "key": 0})
    return {**default, **(doc or {})}


async def set_setting(key: str, values: dict, admin: dict):
    old = await db.association_settings.find_one({"key": key}, {"_id": 0, "key": 0}) or {}
    values = {**values, "updated_at": iso(now_utc())}
    await db.association_settings.update_one({"key": key}, {"$set": values}, upsert=True)
    await log_action(admin, "UPDATE", "settings", key, old_value=old, new_value=values)


@router.get("/settings/theme")
async def theme():
    """Charte graphique : lecture publique (nécessaire dès l'écran de connexion)."""
    return await get_setting("theme", DEFAULT_THEME)


@router.put("/settings/theme")
async def update_theme(payload: ThemeIn, admin: dict = Depends(require_admin)):
    values = payload.model_dump(exclude_none=True)
    for k, v in values.items():
        if not HEX.match(v):
            raise HTTPException(status_code=400, detail=f"Couleur invalide pour « {k} » (format #RRGGBB attendu)")
    await set_setting("theme", values, admin)
    return await get_setting("theme", DEFAULT_THEME)


@router.post("/settings/theme/reset")
async def reset_theme(admin: dict = Depends(require_admin)):
    await db.association_settings.delete_one({"key": "theme"})
    await log_action(admin, "UPDATE", "settings", "theme", new_value=DEFAULT_THEME)
    return DEFAULT_THEME


EMPTY_STATE_MODULES = {
    "tasks": "Tâches", "projects": "Projets", "activities": "Activités", "events": "Événements",
    "dogs": "Chiens", "stock": "Stocks", "documents": "Documents", "guides": "Guides",
    "participations": "Participations", "library": "Bibliothèque", "partners": "Partenaires",
    "directory": "Annuaire", "notifications": "Notifications", "dashboard": "Tableau de bord",
}
ROLES = ["PARTICULIER", "PROFESSIONNEL", "ADMIN_BUREAU"]


class EmptyStatesIn(BaseModel):
    messages: dict


@router.get("/settings/empty-states")
async def empty_states(user: dict = Depends(active_user)):
    doc = await get_setting("empty_states", {})
    return {"modules": EMPTY_STATE_MODULES, "roles": ROLES, "messages": doc.get("messages") or {}}


@router.put("/settings/empty-states")
async def update_empty_states(payload: EmptyStatesIn, admin: dict = Depends(require_admin)):
    clean = {}
    for module, per_role in payload.messages.items():
        if module not in EMPTY_STATE_MODULES or not isinstance(per_role, dict):
            raise HTTPException(status_code=400, detail=f"Module inconnu : {module}")
        clean[module] = {}
        for role, entry in per_role.items():
            if role not in ROLES:
                raise HTTPException(status_code=400, detail=f"Profil inconnu : {role}")
            entry = entry or {}
            clean[module][role] = {"message": (entry.get("message") or "")[:300],
                                   "action_label": (entry.get("action_label") or "")[:60],
                                   "action_link": (entry.get("action_link") or "")[:120]}
    await set_setting("empty_states", {"messages": clean}, admin)
    return {"modules": EMPTY_STATE_MODULES, "roles": ROLES, "messages": clean}


# ---------------------------------------------------------------- Délégation de publication
DEFAULT_DELEGATION = {
    "enabled": True, "levels": ["PRO_COORDINATEUR", "REFERENT_BENEVOLE"],
    "max_capacity": 12, "max_price": 0, "require_association_terrain": True, "min_days_ahead": 3,
    "moderation_hours": 48,
}


class DelegationIn(BaseModel):
    enabled: Optional[bool] = None
    levels: Optional[list] = None
    max_capacity: Optional[int] = None
    max_price: Optional[float] = None
    require_association_terrain: Optional[bool] = None
    min_days_ahead: Optional[int] = None
    moderation_hours: Optional[int] = None


@router.get("/settings/delegation")
async def delegation(user: dict = Depends(active_user)):
    return await get_setting("delegation", DEFAULT_DELEGATION)


@router.put("/settings/delegation")
async def update_delegation(payload: DelegationIn, admin: dict = Depends(require_admin)):
    values = payload.model_dump(exclude_none=True)
    for k in ("max_capacity", "min_days_ahead", "moderation_hours"):
        if k in values and values[k] < 0:
            raise HTTPException(status_code=400, detail=f"Valeur invalide pour {k}")
    await set_setting("delegation", values, admin)
    return await get_setting("delegation", DEFAULT_DELEGATION)


async def delegation_check(user: dict, *, capacity, prices, location, date) -> dict:
    """Retourne {eligible, reasons, settings}. eligible=True → publication directe déléguée."""
    s = await get_setting("delegation", DEFAULT_DELEGATION)
    reasons = []
    if not s.get("enabled") or user.get("access_level") not in (s.get("levels") or []):
        return {"eligible": False, "reasons": ["Profil non délégué"], "settings": s}
    if capacity is not None and s.get("max_capacity") is not None and capacity > s["max_capacity"]:
        reasons.append(f"Capacité > {s['max_capacity']} places")
    if any((p or 0) > (s.get("max_price") or 0) for p in prices):
        reasons.append(f"Tarif > {s.get('max_price') or 0} €")
    if s.get("require_association_terrain"):
        names = [t["name"] async for t in db.terrains.find({}, {"_id": 0, "name": 1})]
        if not location or not any(n.lower() in location.lower() or location.lower() in n.lower() for n in names):
            reasons.append("Lieu hors terrains de l'association")
    if s.get("min_days_ahead"):
        from datetime import timedelta
        floor = iso(now_utc() + timedelta(days=s["min_days_ahead"]))[:10]
        if not date or date[:10] < floor:
            reasons.append(f"Date < J+{s['min_days_ahead']}")
    return {"eligible": not reasons, "reasons": reasons, "settings": s}


# ---------------------------------------------------------------- Onboarding : guides envoyés à la validation
class OnboardingIn(BaseModel):
    guides: dict  # {"PARTICULIER": [guide_id], "PROFESSIONNEL": [guide_id]}


@router.get("/settings/onboarding")
async def onboarding(admin: dict = Depends(require_admin)):
    doc = await get_setting("onboarding", {"guides": {}})
    published = await db.guides.find({"status": "PUBLISHED"}, {"_id": 0, "guide_id": 1, "title": 1, "module": 1,
                                                                 "role_scopes": 1}).sort("title", 1).to_list(200)
    return {"guides": doc.get("guides") or {}, "available": published}


@router.put("/settings/onboarding")
async def update_onboarding(payload: OnboardingIn, admin: dict = Depends(require_admin)):
    clean = {}
    for role, ids in payload.guides.items():
        if role not in ("PARTICULIER", "PROFESSIONNEL"):
            raise HTTPException(status_code=400, detail=f"Profil inconnu : {role}")
        valid = await db.guides.count_documents({"guide_id": {"$in": ids}, "status": "PUBLISHED"})
        if valid != len(set(ids)):
            raise HTTPException(status_code=400, detail="Un des guides n'existe pas ou n'est pas publié")
        clean[role] = list(dict.fromkeys(ids))
    await set_setting("onboarding", {"guides": clean}, admin)
    return {"guides": clean}


async def send_onboarding_guides(user_id: str, role: str):
    from deps import notify
    doc = await get_setting("onboarding", {"guides": {}})
    ids = (doc.get("guides") or {}).get(role) or []
    if not ids:
        return 0
    guides = await db.guides.find({"guide_id": {"$in": ids}, "status": "PUBLISHED"},
                                  {"_id": 0, "guide_id": 1, "title": 1}).to_list(50)
    for g in guides:
        await notify(user_id, type="ONBOARDING_GUIDE", title=f"Guide pour bien démarrer : {g['title']}",
                     message="Le Bureau vous recommande ce guide pour vos premiers pas sur la plateforme.",
                     level="INFO", resource_type="guide", resource_id=g["guide_id"], link=f"/aide?guide={g['guide_id']}")
    await db.users.update_one({"user_id": user_id}, {"$set": {"onboarding_guides_sent_at": iso(now_utc())}})
    return len(guides)


# ---------------------------------------------------------------- Visibilité des blocs par profil
BLOCKS = {
    "member.dogs": "Adhérent · Mes chiens", "member.next": "Adhérent · Prochainement",
    "member.work": "Adhérent · En cours (tâches/projets)", "member.volunteer": "Adhérent · Coups de main recherchés",
    "member.engagement": "Adhérent · Ma progression", "pro.today": "Pro · Aujourd'hui", "pro.week": "Pro · Semaine",
    "pro.tasks": "Pro · Mes tâches", "pro.low_stock": "Pro · Alertes stock", "pro.kpis": "Pro · Indicateurs",
    "nav.advantages": "Menu · Avantages adhérents", "nav.contests": "Menu · Jeux-concours",
    "nav.advent": "Menu · Calendrier de l'Avent", "nav.blog": "Menu · Blog & contenus",
    "nav.formations": "Menu · Formations & lives", "nav.library": "Menu · Bibliothèque",
    "nav.social": "Menu · Réseaux sociaux", "nav.forms": "Menu · Formulaires", "nav.loyalty": "Menu · Carte d'engagement",
}


class BlockVisibilityIn(BaseModel):
    hidden: dict  # {block_key: [roles hidden]}


@router.get("/settings/block-visibility")
async def block_visibility(user: dict = Depends(active_user)):
    doc = await get_setting("block_visibility", {"hidden": {}})
    return {"blocks": BLOCKS, "roles": ROLES, "hidden": doc.get("hidden") or {}}


@router.put("/settings/block-visibility")
async def update_block_visibility(payload: BlockVisibilityIn, admin: dict = Depends(require_admin)):
    clean = {}
    for key, roles in payload.hidden.items():
        if key not in BLOCKS:
            raise HTTPException(status_code=400, detail=f"Bloc inconnu : {key}")
        bad = [r for r in roles if r not in ROLES]
        if bad:
            raise HTTPException(status_code=400, detail=f"Profil inconnu : {bad[0]}")
        if roles:
            clean[key] = roles
    await set_setting("block_visibility", {"hidden": clean}, admin)
    return {"blocks": BLOCKS, "roles": ROLES, "hidden": clean}


# ---------------------------------------------------------------- Récap bihebdomadaire personnalisé
DEFAULT_BIWEEKLY = {"enabled": False,
                    "intro": "Voici votre récapitulatif de quinzaine à La Voix du Chien."}


class BiweeklyIn(BaseModel):
    enabled: Optional[bool] = None
    intro: Optional[str] = None


@router.get("/settings/biweekly-recap")
async def biweekly_recap(user: dict = Depends(active_user)):
    return await get_setting("biweekly_recap", DEFAULT_BIWEEKLY)


@router.put("/settings/biweekly-recap")
async def update_biweekly_recap(payload: BiweeklyIn, admin: dict = Depends(require_admin)):
    values = payload.model_dump(exclude_none=True)
    if "intro" in values:
        values["intro"] = values["intro"][:500]
    await set_setting("biweekly_recap", values, admin)
    return await get_setting("biweekly_recap", DEFAULT_BIWEEKLY)


@router.get("/settings/notification-types")
async def notification_types(user: dict = Depends(active_user)):
    from deps import OPTIONAL_NOTIFICATION_TYPES
    return {"types": OPTIONAL_NOTIFICATION_TYPES, "locked": user["role"] == "ADMIN_BUREAU"}


# ---------------------------------------------------------------- Carnet de suivi du chien (modèle)
DEFAULT_DOG_JOURNAL_TEMPLATE = {
    "sections": [
        {"section_id": "objectifs", "label": "Objectifs", "kind": "OBJECTIVES"},
        {"section_id": "progression", "label": "Progression", "kind": "TEXT"},
        {"section_id": "seances", "label": "Séances réalisées", "kind": "TEXT"},
        {"section_id": "notes", "label": "Notes comportementales", "kind": "TEXT"},
        {"section_id": "photos", "label": "Photos", "kind": "PHOTOS"},
    ],
}
JOURNAL_SECTION_KINDS = ["TEXT", "OBJECTIVES", "PHOTOS"]


class JournalSection(BaseModel):
    section_id: Optional[str] = None
    label: str
    kind: str = "TEXT"


class DogJournalTemplateIn(BaseModel):
    sections: List[JournalSection]


@router.get("/settings/dog-journal-template")
async def dog_journal_template(user: dict = Depends(active_user)):
    return await get_setting("dog_journal_template", DEFAULT_DOG_JOURNAL_TEMPLATE)


@router.put("/settings/dog-journal-template")
async def update_dog_journal_template(payload: DogJournalTemplateIn, admin: dict = Depends(require_admin)):
    sections, seen = [], set()
    for s in payload.sections:
        if s.kind not in JOURNAL_SECTION_KINDS:
            raise HTTPException(status_code=400, detail=f"Type de section invalide : {s.kind}")
        if not (s.label or "").strip():
            raise HTTPException(status_code=400, detail="Chaque section doit avoir un nom")
        sid = s.section_id or new_id("sec")
        if sid in seen:
            sid = new_id("sec")
        seen.add(sid)
        sections.append({"section_id": sid, "label": s.label.strip()[:80], "kind": s.kind})
    if not sections:
        raise HTTPException(status_code=400, detail="Le modèle doit comporter au moins une section")
    await set_setting("dog_journal_template", {"sections": sections}, admin)
    return {"sections": sections}
