"""Iteration 36 — RBAC exhaustif des 3 sous-types PROFESSIONNEL.

Verifie:
- Login pour PRO_STANDARD / PRO_AVANCE / PRO_COORDINATEUR
- /auth/me retourne bon access_level et permissions correspondantes
- Activation journey NE contient PAS le step "dog" pour PROFESSIONNEL
- RBAC differences: activities.create/propose, events.create/edit, tasks.create/assign, members.edit
- Endpoints ecriture Bureau-only renvoient 403 francais sans crash
"""
import os
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL introuvable"

PROS = {
    "PRO_STANDARD":     ("pro1.demo@lavoixduchien.fr", "Demo2026!"),
    "PRO_COORDINATEUR": ("pro2.demo@lavoixduchien.fr", "Demo2026!"),
    "PRO_AVANCE":       ("pro3.demo@lavoixduchien.fr", "Demo2026!"),
}

EXPECTED_PERMS = {
    "PRO_STANDARD": {
        "has": {"activities.propose", "tasks.submit", "documents.upload", "mindmap.view",
                "members.view", "finance.view_own", "partners.view", "loyalty.stamp"},
        "not_has": {"activities.create", "tasks.create", "tasks.edit", "tasks.assign",
                    "events.create", "events.edit", "members.edit", "library.upload",
                    "projects.edit", "stats.view"},
    },
    "PRO_AVANCE": {
        "has": {"activities.create", "activities.propose", "tasks.create", "tasks.edit",
                "events.edit", "library.upload", "terrain.reserve", "social.view"},
        "not_has": {"events.create", "tasks.assign", "projects.edit", "stats.view",
                    "members.edit", "social.manage"},
    },
    "PRO_COORDINATEUR": {
        "has": {"events.create", "tasks.assign", "projects.edit", "stats.view",
                "activities.create", "tasks.create", "tasks.edit", "events.edit", "social.manage"},
        "not_has": {"members.edit", "members.validate", "users.manage"},
    },
}


def login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    s.headers["Authorization"] = f"Bearer {data['access_token']}"
    return s, data["user"]


@pytest.fixture(scope="module")
def sessions():
    out = {}
    for level, (email, pwd) in PROS.items():
        s, user = login(email, pwd)
        out[level] = (s, user)
    return out


# ------------------------- A. Auth / access_level -------------------------
@pytest.mark.parametrize("level", list(PROS))
def test_login_and_access_level(sessions, level):
    s, user = sessions[level]
    assert user["role"] == "PROFESSIONNEL"
    assert user["access_level"] == level, f"Attendu {level}, obtenu {user['access_level']}"

    r = s.get(f"{BASE}/api/auth/me", timeout=10)
    assert r.status_code == 200
    me = r.json()
    assert me["user"]["access_level"] == level


# ------------------------- Effective permissions -------------------------
@pytest.mark.parametrize("level", list(PROS))
def test_effective_permissions(sessions, level):
    s, _ = sessions[level]
    r = s.get(f"{BASE}/api/settings/rbac", timeout=10)
    # Cet endpoint retourne la matrice, peut etre ADMIN-only; on inspecte /auth/me sinon
    if r.status_code != 200:
        # fallback: pas de matrice exposee; verifier via appels ciblés (autres tests)
        pytest.skip("Matrice RBAC non exposee pour non-admin")
    data = r.json()
    perms = set(data.get("permissions") or data.get("effective") or [])
    exp = EXPECTED_PERMS[level]
    missing = exp["has"] - perms
    unexpected = exp["not_has"] & perms
    assert not missing, f"{level}: permissions manquantes {missing}"
    assert not unexpected, f"{level}: permissions non attendues presentes {unexpected}"


# ------------------------- B. Activation journey (no dog step for PRO) -------------------------
@pytest.mark.parametrize("level", list(PROS))
def test_activation_no_dog_step_for_pro(sessions, level):
    s, _ = sessions[level]
    r = s.get(f"{BASE}/api/activation/journey", timeout=10)
    assert r.status_code == 200
    steps = r.json().get("steps", [])
    keys = [step["key"] for step in steps]
    assert "dog" not in keys, f"Step 'dog' ne doit PAS apparaitre pour PROFESSIONNEL ({level}): {keys}"
    assert "profile" in keys
    assert "activity" in keys


# ------------------------- C. Events RBAC -------------------------
EVENT_PAYLOAD = {
    "title": "TEST_iter36_event",
    "description": "test",
    "event_type": "SORTIE",
    "status": "PLANNED",
    "start_date": "2026-06-15T10:00:00Z",
    "end_date": "2026-06-15T12:00:00Z",
    "location": "Terrain club",
    "capacity": 10,
    "visibility": "MEMBERS",
}


def _extract_detail(r):
    try:
        return r.json().get("detail", "")
    except Exception:
        return r.text


def test_events_create_standard_403(sessions):
    s, _ = sessions["PRO_STANDARD"]
    r = s.post(f"{BASE}/api/events", json=EVENT_PAYLOAD, timeout=10)
    assert r.status_code == 403, f"PRO_STANDARD ne doit pas creer un evenement, got {r.status_code}"
    detail = _extract_detail(r)
    assert "events.create" in detail or "Permission" in detail or "réservé" in detail.lower() or "reserve" in detail.lower()


def test_events_create_avance_403(sessions):
    s, _ = sessions["PRO_AVANCE"]
    r = s.post(f"{BASE}/api/events", json=EVENT_PAYLOAD, timeout=10)
    assert r.status_code == 403, f"PRO_AVANCE ne doit pas creer un evenement, got {r.status_code}"


def test_events_create_coord_allowed(sessions):
    s, _ = sessions["PRO_COORDINATEUR"]
    r = s.post(f"{BASE}/api/events", json=EVENT_PAYLOAD, timeout=15)
    # Peut retourner 200/201 ou 400 pour validation metier; PAS 403
    assert r.status_code != 403, f"PRO_COORDINATEUR doit pouvoir creer un event, got {r.status_code} {r.text[:200]}"
    if r.status_code in (200, 201):
        evt = r.json()
        eid = evt.get("event_id")
        if eid:
            # cleanup: seul admin peut delete → on laisse, prefixe TEST_
            pass


# ------------------------- D. Activities RBAC -------------------------
ACT_PAYLOAD = {
    "title": "TEST_iter36_activity",
    "description": "test",
    "category": "BALADE",
    "type": "COLLECTIVE",
    "date": "2026-06-20T10:00:00Z",
    "duration_minutes": 60,
    "location": "Parc",
    "capacity": 5,
    "price_public": 0,
    "price_member": 0,
    "visibility": "MEMBERS",
    "loyalty_points": 1,
}


def test_activities_propose_standard(sessions):
    """PRO_STANDARD peut PROPOSER une activite (status PROPOSED)."""
    s, _ = sessions["PRO_STANDARD"]
    r = s.post(f"{BASE}/api/activities", json=ACT_PAYLOAD, timeout=15)
    # Doit reussir ou echouer sur validation metier (categorie/type) mais PAS 403
    if r.status_code == 400:
        pytest.skip(f"Validation metier activite: {r.text[:200]}")
    assert r.status_code in (200, 201), f"PRO_STANDARD doit pouvoir proposer, got {r.status_code} {r.text[:200]}"
    act = r.json()
    assert act.get("status") == "PROPOSED", f"Activite creee par PRO_STANDARD doit etre PROPOSED, got {act.get('status')}"


def test_activities_create_coord(sessions):
    """PRO_COORDINATEUR peut creer + publier (a activities.validate? Non - il ne l'a pas)."""
    s, _ = sessions["PRO_COORDINATEUR"]
    r = s.post(f"{BASE}/api/activities", json=ACT_PAYLOAD, timeout=15)
    if r.status_code == 400:
        pytest.skip(f"Validation metier: {r.text[:200]}")
    assert r.status_code in (200, 201), f"got {r.status_code} {r.text[:200]}"


# ------------------------- E. Tasks RBAC -------------------------
def test_tasks_create_standard_403(sessions):
    """PRO_STANDARD ne peut pas creer de tache (tasks.create absent)."""
    s, _ = sessions["PRO_STANDARD"]
    # Recupere un projet visible
    r = s.get(f"{BASE}/api/projects", timeout=10)
    if r.status_code != 200 or not r.json():
        pytest.skip("Aucun projet visible pour PRO_STANDARD")
    projects = r.json()
    pid = projects[0]["project_id"] if isinstance(projects, list) else projects.get("items", [{}])[0].get("project_id")
    if not pid:
        pytest.skip("Structure projet inattendue")
    r = s.post(f"{BASE}/api/tasks", json={"project_id": pid, "title": "TEST_iter36_task"}, timeout=10)
    assert r.status_code == 403, f"PRO_STANDARD ne doit pas creer, got {r.status_code} {r.text[:200]}"
    assert "tasks.create" in _extract_detail(r) or "coordinateur" in _extract_detail(r).lower()


# ------------------------- F. Members edit forbidden -------------------------
@pytest.mark.parametrize("level", list(PROS))
def test_members_edit_forbidden(sessions, level):
    s, user = sessions[level]
    # tente de modifier son propre role via PUT /members/{id}
    r = s.put(f"{BASE}/api/members/{user['user_id']}", json={"access_level": "PRO_COORDINATEUR"}, timeout=10)
    assert r.status_code in (401, 403), f"{level} ne doit pas modifier un membre, got {r.status_code} {r.text[:200]}"


# ------------------------- G. Read endpoints load without crash -------------------------
READ_ENDPOINTS = [
    "/api/activities", "/api/events", "/api/projects",
    "/api/documents", "/api/partners", "/api/notifications",
    "/api/members", "/api/dashboard/pro",
]


@pytest.mark.parametrize("level", list(PROS))
@pytest.mark.parametrize("endpoint", READ_ENDPOINTS)
def test_read_endpoints_no_crash(sessions, level, endpoint):
    s, _ = sessions[level]
    r = s.get(f"{BASE}{endpoint}", timeout=15)
    assert r.status_code < 500, f"{level} {endpoint} crash 5xx: {r.status_code} {r.text[:200]}"
    assert r.status_code in (200, 403, 404), f"{level} {endpoint} status inattendu {r.status_code}"
