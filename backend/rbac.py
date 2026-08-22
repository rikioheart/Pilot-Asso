"""Moteur RBAC : ROLE + NIVEAU + PERMISSIONS + overrides. Source de vérité backend."""

ROLE_ADMIN = "ADMIN_BUREAU"
ROLE_PRO = "PROFESSIONNEL"
ROLE_MEMBER = "PARTICULIER"

ALL_PERMISSIONS = [
    "members.view", "members.edit", "members.validate", "members.delete",
    "projects.view", "projects.create", "projects.edit", "projects.archive", "projects.delete",
    "tasks.view", "tasks.create", "tasks.edit", "tasks.assign", "tasks.submit", "tasks.validate", "tasks.delete",
    "events.view", "events.create", "events.edit", "events.delete",
    "activities.view", "activities.create", "activities.propose", "activities.validate",
    "finance.view_global", "finance.view_own", "finance.edit", "finance.validate",
    "partners.view", "partners.edit", "partners.validate",
    "documents.view", "documents.upload", "documents.delete",
    "mindmap.view", "mindmap.edit",
    "terrain.view", "terrain.reserve", "terrain.validate",
    "loyalty.view_own", "loyalty.stamp", "loyalty.manage",
    "settings.view", "settings.edit",
    "users.manage", "audit.view", "stats.view",
    "content.view", "content.create", "content.validate",
    "formations.view", "formations.create", "formations.manage",
    "library.view", "library.upload", "library.manage",
    "social.view", "social.manage",
    "contests.view", "contests.participate", "contests.manage",
    "advent.view", "advent.manage",
    "advantages.view", "advantages.manage",
    "stock.view", "stock.manage",
    "forms.view", "forms.manage",
    "help.view", "guides.manage", "guides.propose", "pros.review",
    "audit.view_own",
]

MANAGER_BADGES = {"FONDATEUR", "PRESIDENT", "BUREAU", "REPRESENTANT", "REPRESENTANT_LOCAL"}

_PRO_STANDARD = [
    "projects.view", "tasks.view", "tasks.submit", "events.view", "activities.view",
    "activities.propose", "finance.view_own", "partners.view", "documents.view",
    "documents.upload", "mindmap.view", "terrain.view", "members.view",
    "content.view", "content.create", "formations.view", "library.view",
    "contests.view", "advent.view", "advantages.view", "forms.view", "audit.view_own",
    "loyalty.stamp", "help.view",
]
_PRO_AVANCE = _PRO_STANDARD + ["tasks.edit", "tasks.create", "events.edit", "activities.create",
                               "terrain.reserve", "library.upload", "guides.propose",
                               "formations.create", "social.view"]
_PRO_COORD = _PRO_AVANCE + ["projects.edit", "tasks.assign", "events.create", "stats.view", "social.manage"]

_MEMBER_STANDARD = ["activities.view", "events.view", "loyalty.view_own", "partners.view",
                    "content.view", "formations.view", "library.view", "contests.view",
                    "contests.participate", "advent.view", "advantages.view", "forms.view",
                    "audit.view_own", "help.view"]
_MEMBER_IMPLIQUE = _MEMBER_STANDARD + ["projects.view"]
_BENEVOLE = _MEMBER_IMPLIQUE + ["tasks.view", "tasks.submit", "content.create"]
_REFERENT = _BENEVOLE + ["tasks.assign", "library.upload", "social.view"]

LEVEL_PERMISSIONS = {
    "PRO_STANDARD": _PRO_STANDARD,
    "PRO_AVANCE": _PRO_AVANCE,
    "PRO_COORDINATEUR": _PRO_COORD,
    "PARTICULIER_STANDARD": _MEMBER_STANDARD,
    "PARTICULIER_IMPLIQUE": _MEMBER_IMPLIQUE,
    "BENEVOLE_VALIDE": _BENEVOLE,
    "REFERENT_BENEVOLE": _REFERENT,
}

DEFAULT_LEVEL = {
    ROLE_ADMIN: "BUREAU",
    ROLE_PRO: "PRO_STANDARD",
    ROLE_MEMBER: "PARTICULIER_STANDARD",
}

LEVELS_BY_ROLE = {
    ROLE_ADMIN: ["BUREAU"],
    ROLE_PRO: ["PRO_STANDARD", "PRO_AVANCE", "PRO_COORDINATEUR"],
    ROLE_MEMBER: ["PARTICULIER_STANDARD", "PARTICULIER_IMPLIQUE", "BENEVOLE_VALIDE", "REFERENT_BENEVOLE"],
}


def effective_permissions(user: dict) -> list:
    if user.get("role") == ROLE_ADMIN:
        return list(ALL_PERMISSIONS)
    perms = set(LEVEL_PERMISSIONS.get(user.get("access_level"), []))
    overrides = user.get("permission_overrides") or {}
    for p in overrides.get("granted", []):
        if p in ALL_PERMISSIONS:
            perms.add(p)
    for p in overrides.get("revoked", []):
        perms.discard(p)
    return sorted(perms)


def is_manager(user: dict, profile: dict = None) -> bool:
    """Bureau ou représentant mandaté (badge de fonction)."""
    if user.get("role") == ROLE_ADMIN:
        return True
    badges = set((profile or {}).get("function_badges") or [])
    return bool(badges & MANAGER_BADGES)


def has_permission(user: dict, permission: str) -> bool:
    if not user.get("is_active") or user.get("status") != "ACTIVE":
        return False
    return permission in effective_permissions(user)
