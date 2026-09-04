"""Prompt 8 Lot A: theme settings + extended global search."""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

BUREAU = ("associationlavoixduchien@gmail.com", "VoixDuChien2026!")
PRO1 = ("pro1.demo@lavoixduchien.fr", "Demo2026!")
MEMBRE1 = ("membre1.demo@lavoixduchien.fr", "Demo2026!")

THEME_KEYS = {"primary", "primary_dark", "dark", "surface", "surface_alt",
              "status_ok", "status_warn", "status_error"}


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def bureau_tok():
    return login(*BUREAU)


@pytest.fixture(scope="module")
def pro1_tok():
    return login(*PRO1)


@pytest.fixture(scope="module")
def membre1_tok():
    return login(*MEMBRE1)


# ---------- Theme ----------

def test_theme_public_get():
    r = requests.get(f"{API}/settings/theme", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert THEME_KEYS.issubset(data.keys()), f"missing keys: {THEME_KEYS - set(data)}"


def test_theme_put_bureau_ok(bureau_tok):
    r = requests.put(f"{API}/settings/theme", json={"primary": "#123456"}, headers=auth(bureau_tok), timeout=15)
    assert r.status_code == 200, r.text
    g = requests.get(f"{API}/settings/theme", timeout=15).json()
    assert g["primary"].lower() == "#123456"


def test_theme_put_invalid_color(bureau_tok):
    r = requests.put(f"{API}/settings/theme", json={"primary": "rouge"}, headers=auth(bureau_tok), timeout=15)
    assert r.status_code == 400


def test_theme_put_forbidden_pro(pro1_tok):
    r = requests.put(f"{API}/settings/theme", json={"primary": "#111111"}, headers=auth(pro1_tok), timeout=15)
    assert r.status_code == 403


def test_theme_reset(bureau_tok):
    r = requests.post(f"{API}/settings/theme/reset", headers=auth(bureau_tok), timeout=15)
    assert r.status_code == 200
    g = requests.get(f"{API}/settings/theme", timeout=15).json()
    assert g["primary"].lower() == "#800020"


# ---------- Global search ----------

def test_search_bureau_groups(bureau_tok):
    r = requests.get(f"{API}/search", params={"q": "DEMO"}, headers=auth(bureau_tok), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    # Response could be a list of groups or a dict — check both.
    labels = _extract_labels(data)
    print("Bureau search labels:", labels)
    # Expect at least some of these extended labels present
    extended = {"Activités", "Événements", "Stocks", "Documents", "Guides"}
    assert labels & extended, f"None of extended labels present, got: {labels}"


def test_search_membre_no_stock_docs(membre1_tok):
    r = requests.get(f"{API}/search", params={"q": "DEMO"}, headers=auth(membre1_tok), timeout=20)
    assert r.status_code == 200, r.text
    labels = _extract_labels(r.json())
    print("Membre1 search labels:", labels)
    assert "Stocks" not in labels, "Membre should not see Stocks"
    assert "Documents" not in labels, "Membre should not see Documents"


def _extract_labels(data):
    """Try to extract group labels from various shapes."""
    labels = set()
    if isinstance(data, dict):
        # e.g. {"groups": [{"label": ...}]} or {"Activités": [...], ...}
        if "groups" in data and isinstance(data["groups"], list):
            for g in data["groups"]:
                if isinstance(g, dict):
                    labels.add(g.get("label") or g.get("name") or g.get("title"))
        else:
            labels.update(k for k in data.keys() if isinstance(k, str))
    elif isinstance(data, list):
        for g in data:
            if isinstance(g, dict):
                labels.add(g.get("label") or g.get("name") or g.get("title"))
    return {l for l in labels if l}
