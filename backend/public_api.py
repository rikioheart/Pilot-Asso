"""Prompt 8E Lot C — Page publique de l'association (accessible sans connexion)."""
from fastapi import APIRouter, Depends

from deps import db, iso, now_utc, require_admin
from settings_api import get_setting, set_setting

router = APIRouter(prefix="/api")

DEFAULT_PUBLIC = {
    "enabled": True, "show_events": True, "show_pros": True, "show_gallery": True,
    "website_url": "", "login_panel_text": "", "login_panel_title": "",
    "intro": "Bienvenue à La Voix du Chien — l'association qui accompagne chiens et humains, "
             "avec bienveillance et sans jugement.",
}


@router.get("/settings/public-page")
async def public_page_settings(admin: dict = Depends(require_admin)):
    return await get_setting("public_page", DEFAULT_PUBLIC)


@router.put("/settings/public-page")
async def update_public_page(payload: dict, admin: dict = Depends(require_admin)):
    allowed = {k: payload[k] for k in ("enabled", "show_events", "show_pros", "show_gallery", "intro")
               if k in payload}
    if "intro" in allowed:
        allowed["intro"] = str(allowed["intro"])[:600]
    if "website_url" in payload:
        url = str(payload["website_url"] or "").strip()[:300]
        if url and not url.startswith(("http://", "https://")):
            url = "https://" + url
        allowed["website_url"] = url
    if "login_panel_text" in payload:
        allowed["login_panel_text"] = str(payload["login_panel_text"] or "")[:5000]
    if "login_panel_title" in payload:
        allowed["login_panel_title"] = str(payload["login_panel_title"] or "").strip()[:150]
    await set_setting("public_page", allowed, admin)
    return await get_setting("public_page", DEFAULT_PUBLIC)


@router.get("/public/page")
async def public_page():
    cfg = await get_setting("public_page", DEFAULT_PUBLIC)
    website_url = cfg.get("website_url") or ""
    login_panel_text = cfg.get("login_panel_text") or ""
    login_panel_title = cfg.get("login_panel_title") or ""
    if not cfg.get("enabled"):
        return {"enabled": False, "website_url": website_url,
                "login_panel_text": login_panel_text, "login_panel_title": login_panel_title}
    today = iso(now_utc())[:10]
    events, pros, activities = [], [], []
    if cfg.get("show_events"):
        cur = db.events.find({"visibility": "PUBLIC", "status": "PLANNED", "start_date": {"$gte": today}},
                             {"_id": 0, "event_id": 1, "title": 1, "start_date": 1, "location": 1,
                              "description": 1}).sort("start_date", 1).limit(12)
        events = await cur.to_list(12)
    if cfg.get("show_pros"):
        async for u in db.users.find({"role": "PROFESSIONNEL", "status": "ACTIVE"}, {"_id": 0, "user_id": 1}).limit(40):
            prof = await db.profiles.find_one({"user_id": u["user_id"]},
                                              {"_id": 0, "display_name": 1, "bio": 1, "city": 1})
            pros.append({"user_id": u["user_id"],
                         "display_name": (prof or {}).get("display_name") or "Professionnel",
                         "bio": (prof or {}).get("bio"), "city": (prof or {}).get("city")})
    if cfg.get("show_gallery"):
        cur = db.activities.find({"visibility": "PUBLIC"},
                                 {"_id": 0, "activity_id": 1, "title": 1, "date": 1, "category": 1}
                                 ).sort("date", -1).limit(8)
        activities = await cur.to_list(8)
    return {"enabled": True, "config": cfg, "association_name": "La Voix du Chien",
            "website_url": website_url, "login_panel_text": login_panel_text,
            "login_panel_title": login_panel_title,
            "events": events, "pros": pros, "activities": activities}
