"""Tests for dashboard secondary panel layout preferences (Prompt A)."""
import os
import pytest
import requests
from pathlib import Path

def _read_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE = _read_backend_url().rstrip("/")

ADMIN = ("associationlavoixduchien@gmail.com", "VoixDuChien2026!")
MEMBER = ("membre1.demo@lavoixduchien.fr", "Demo2026!")
PRO = ("pro3.demo@lavoixduchien.fr", "Demo2026!")


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def member_session():
    return _login(*MEMBER)


@pytest.fixture(scope="module")
def pro_session():
    return _login(*PRO)


def test_layout_default_true(member_session):
    # Ensure clean state: reset pref to expanded first
    member_session.put(f"{BASE}/api/account/dashboard", json={"secondary_open": True})
    r = member_session.get(f"{BASE}/api/dashboard/layout")
    assert r.status_code == 200
    data = r.json()
    assert "secondary_open" in data and "default_open" in data
    assert data["secondary_open"] is True


def test_put_persists_false_then_true(member_session):
    r = member_session.put(f"{BASE}/api/account/dashboard", json={"secondary_open": False})
    assert r.status_code == 200
    g = member_session.get(f"{BASE}/api/dashboard/layout").json()
    assert g["secondary_open"] is False
    # Restore
    member_session.put(f"{BASE}/api/account/dashboard", json={"secondary_open": True})
    g2 = member_session.get(f"{BASE}/api/dashboard/layout").json()
    assert g2["secondary_open"] is True


def test_settings_dashboard_admin_get(admin_session):
    r = admin_session.get(f"{BASE}/api/settings/dashboard")
    assert r.status_code == 200
    data = r.json()
    assert set(data["roles"].keys()) >= {"PARTICULIER", "PROFESSIONNEL", "PRO_COORDINATEUR", "ADMIN_BUREAU"}


def test_settings_dashboard_member_forbidden(member_session):
    r = member_session.put(f"{BASE}/api/settings/dashboard",
                           json={"roles": {"PARTICULIER": False}})
    assert r.status_code == 403


def test_settings_dashboard_pro_forbidden(pro_session):
    r = pro_session.get(f"{BASE}/api/settings/dashboard")
    assert r.status_code == 403


def test_settings_dashboard_admin_put_and_reset(admin_session):
    # Toggle PARTICULIER off
    r = admin_session.put(f"{BASE}/api/settings/dashboard",
                          json={"roles": {"PARTICULIER": False, "PROFESSIONNEL": True,
                                          "PRO_COORDINATEUR": True, "ADMIN_BUREAU": True}})
    assert r.status_code == 200
    assert r.json()["roles"]["PARTICULIER"] is False
    # Reset all to True (cleanup as requested)
    r2 = admin_session.put(f"{BASE}/api/settings/dashboard",
                           json={"roles": {"PARTICULIER": True, "PROFESSIONNEL": True,
                                           "PRO_COORDINATEUR": True, "ADMIN_BUREAU": True}})
    assert r2.status_code == 200
    assert all(r2.json()["roles"].values())
