"""Tests for PRO personal dogs feature (Mes chiens tab) + DELETE /api/dogs/{id}."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://pilotage-voix.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "PRO_STANDARD": ("pro1.demo@lavoixduchien.fr", "Demo2026!"),
    "PRO_AVANCE": ("pro3.demo@lavoixduchien.fr", "Demo2026!"),
    "PRO_COORDINATEUR": ("pro2.demo@lavoixduchien.fr", "Demo2026!"),
    "PARTICULIER": ("membre1.demo@lavoixduchien.fr", "Demo2026!"),
}


def login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    me = s.get(f"{API}/auth/me", timeout=15).json()["user"]
    return s, me


@pytest.mark.parametrize("label", list(CREDS.keys()))
def test_own_dog_full_flow(label):
    email, pwd = CREDS[label]
    s, me = login(email, pwd)
    uid = me["user_id"]

    # Create personal dog
    payload = {"name": f"TEST_{label}_Rex", "breed": "Labrador", "history": "test"}
    r = s.post(f"{API}/dogs", json=payload, timeout=15)
    assert r.status_code == 200, f"Create dog for {label}: {r.status_code} {r.text}"
    dog = r.json()
    dog_id = dog["dog_id"]
    assert dog["owner_id"] == uid
    assert dog["name"] == payload["name"]

    # List own dogs
    r = s.get(f"{API}/dogs", params={"owner_id": uid}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["can_create"] is True
    ids = [d["dog_id"] for d in data["items"]]
    assert dog_id in ids, f"{label} own dog not in owner_id=self list"

    # Isolation: /dogs without owner_id (Chiens suivis) should NOT contain personal dog for PRO
    if label.startswith("PRO"):
        r = s.get(f"{API}/dogs", timeout=15)
        assert r.status_code == 200
        followed_ids = [d["dog_id"] for d in r.json()["items"]]
        assert dog_id not in followed_ids, f"{label}: personal dog leaked into Chiens suivis"

    # Delete
    r = s.delete(f"{API}/dogs/{dog_id}", timeout=15)
    assert r.status_code == 200, f"Delete failed for {label}: {r.status_code} {r.text}"
    assert r.json().get("ok") is True

    # Verify removal
    r = s.get(f"{API}/dogs/{dog_id}", timeout=15)
    assert r.status_code == 404


def test_empty_state_for_fresh_pro():
    # Just verify list returns items list (may or may not be empty)
    s, me = login(*CREDS["PRO_AVANCE"])
    r = s.get(f"{API}/dogs", params={"owner_id": me["user_id"]}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
