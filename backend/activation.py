"""Prompt 8G — Parcours d'activation du nouveau membre (distinct des guides d'utilisation)."""
from fastapi import APIRouter, Depends

from rbac import ROLE_ADMIN, ROLE_MEMBER
from deps import db, iso, now_utc, active_user, log_action

router = APIRouter(prefix="/api")


async def _build_steps(user: dict) -> list:
    uid = user["user_id"]
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    profile_done = all(profile.get(f) for f in ("first_name", "last_name", "phone"))
    steps = [{
        "key": "profile", "title": "Compléter mon profil",
        "description": "Renseignez votre prénom, votre nom et un téléphone pour que le Bureau puisse vous joindre.",
        "cta_label": "Compléter mon profil", "cta_link": "/profile", "done": profile_done,
    }]
    if user["role"] == ROLE_MEMBER:
        has_dog = await db.dogs.count_documents({"owner_id": uid}) > 0
        steps.append({
            "key": "dog", "title": "Activer le carnet de mon chien",
            "description": "Ajoutez votre chien pour suivre sa progression au fil des activités.",
            "cta_label": "Ajouter mon chien", "cta_link": "/profile", "done": has_dog,
        })
    joined = await db.participations.count_documents({"user_id": uid}) > 0
    steps.append({
        "key": "activity", "title": "Rejoindre une première activité",
        "description": "Découvrez les balades et ateliers à venir et inscrivez-vous à celui qui vous parle.",
        "cta_label": "Voir les activités", "cta_link": "/activities", "done": joined,
    })
    return steps


@router.get("/activation/journey")
async def get_journey(user: dict = Depends(active_user)):
    if user["role"] == ROLE_ADMIN:
        return {"eligible": False, "steps": [], "done": True, "skipped": False}
    profile = await db.profiles.find_one({"user_id": user["user_id"]},
                                         {"_id": 0, "activation_done": 1, "activation_skipped": 1}) or {}
    steps = await _build_steps(user)
    return {
        "eligible": not profile.get("activation_done"),
        "steps": steps,
        "done": bool(profile.get("activation_done")),
        "skipped": bool(profile.get("activation_skipped")),
        "completed_count": sum(1 for s in steps if s["done"]),
        "total": len(steps),
    }


@router.post("/activation/complete")
async def complete_journey(user: dict = Depends(active_user)):
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"activation_done": True, "activation_completed_at": iso(now_utc()),
                                           "updated_at": iso(now_utc())}})
    await log_action(user, "ACTIVATION_DONE", "account", user["user_id"])
    return {"done": True}


@router.post("/activation/skip")
async def skip_journey(user: dict = Depends(active_user)):
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"activation_done": True, "activation_skipped": True,
                                           "updated_at": iso(now_utc())}})
    await log_action(user, "ACTIVATION_SKIP", "account", user["user_id"])
    return {"done": True, "skipped": True}
