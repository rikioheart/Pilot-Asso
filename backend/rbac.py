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
]

_PRO_STANDARD = [
    "projects.view", "tasks.view", "tasks.submit", "events.view", "activities.view",
    "activities.propose", "finance.view_own", "partners.view", "documents.view",
    "documents.upload", "mindmap.view", "terrain.view", "members.view",
]
_PRO_AVANCE = _PRO_STANDARD + ["tasks.edit", "tasks.create", "events.edit", "activities.create", "terrain.reserve"]
_PRO_COORD = _PRO_AVANCE + ["projects.edit", "tasks.assign", "loyalty.stamp", "stats.view"]

_MEMBER_STANDARD = ["activities.view", "events.view", "loyalty.view_own", "documents.view", "partners.view"]
_MEMBER_IMPLIQUE = _MEMBER_STANDARD + ["projects.view", "mindmap.view"]
_BENEVOLE = _MEMBER_IMPLIQUE + ["tasks.view", "tasks.submit"]
_REFERENT = _BENEVOLE + ["tasks.assign"]

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


def has_permission(user: dict, permission: str) -> bool:
    if not user.get("is_active") or user.get("status") != "ACTIVE":
        return False
    return permission in effective_permissions(user)
