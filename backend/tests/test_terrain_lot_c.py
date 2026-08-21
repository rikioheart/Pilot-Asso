"""Tests Lot C — Terrains: tarifs horaires, réservations, écritures financières."""
import time
import requests
import pytest
from tests.conftest import BASE_URL, auth_headers


# ---------- Meta ----------
def test_terrains_meta_categories(admin_token):
    r = requests.get(f"{BASE_URL}/api/terrains/meta", headers=auth_headers(admin_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    expected = {"SEANCE_SIMPLE", "COLLECTIVE", "SPORTIVE", "EVENEMENT", "REUNION", "FORMATION", "STAGE"}
    assert expected.issubset(set(d["categories"]))
    labels = d["category_labels"]
    assert labels["SEANCE_SIMPLE"] == "Séance simple"
    assert labels["COLLECTIVE"] == "Séance collective"
    assert labels["SPORTIVE"] == "Activité sportive"
    assert labels["EVENEMENT"] == "Événement"
    assert labels["REUNION"] == "Réunion"
    assert labels["FORMATION"] == "Formation"
    assert labels["STAGE"] == "Stage"


# ---------- Fixture: terrain de test avec tarifs ----------
@pytest.fixture(scope="module")
def test_terrain(request):
    admin_tok, _ = _login_direct("associationlavoixduchien@gmail.com", "VoixDuChien2026!")
    assert admin_tok, "Admin login failed"
    payload = {"name": f"TEST_Terrain_LotC_{int(time.time())}", "location": "Zone test",
               "description": "Terrain de tests Lot C", "status": "DISPONIBLE"}
    r = requests.post(f"{BASE_URL}/api/terrains", json=payload, headers=auth_headers(admin_tok), timeout=15)
    assert r.status_code == 200, r.text
    terrain_id = r.json()["terrain_id"]
    # Update rates
    rates = {"SEANCE_SIMPLE": 20, "COLLECTIVE": 35, "SPORTIVE": 40, "EVENEMENT": 50,
             "REUNION": 15, "FORMATION": 30, "STAGE": 45}
    r = requests.put(f"{BASE_URL}/api/terrains/{terrain_id}",
                     json={"hourly_rates": rates}, headers=auth_headers(admin_tok), timeout=15)
    assert r.status_code == 200
    yield {"terrain_id": terrain_id, "admin_token": admin_tok, "rates": rates}


def _login_direct(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        return None, None
    d = r.json()
    return d.get("access_token"), d.get("user")


# ---------- Persistence des tarifs ----------
def test_terrain_rates_persisted(test_terrain):
    tok = test_terrain["admin_token"]
    r = requests.get(f"{BASE_URL}/api/terrains", headers=auth_headers(tok), timeout=15)
    assert r.status_code == 200
    item = next((t for t in r.json()["items"] if t["terrain_id"] == test_terrain["terrain_id"]), None)
    assert item is not None
    assert item["hourly_rates"]["SEANCE_SIMPLE"] == 20
    assert item["hourly_rates"]["COLLECTIVE"] == 35


# ---------- Réservation pro (COLLECTIVE 2h => 70€) ----------
@pytest.fixture(scope="module")
def pro_reservation(test_terrain):
    pro_tok, _ = _login_direct("pro2.demo@lavoixduchien.fr", "Demo2026!")
    assert pro_tok
    # date demain
    from datetime import datetime, timedelta
    date = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
    payload = {"terrain_id": test_terrain["terrain_id"], "date": date,
               "start_time": "10:00", "end_time": "12:00", "category": "COLLECTIVE",
               "purpose": "TEST_Séance collective"}
    r = requests.post(f"{BASE_URL}/api/terrain-reservations", json=payload,
                      headers=auth_headers(pro_tok), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    yield {"reservation": d, "pro_token": pro_tok, "date": date}


def test_reservation_amount_calculation(pro_reservation):
    d = pro_reservation["reservation"]
    assert d["amount"] == 70.0
    assert d["hours"] == 2
    assert d["hourly_rate"] == 35
    assert d["status"] == "PENDING"
    assert d["payment_status"] == "EXPECTED"


# ---------- Confirm => écriture PROVISIONAL ----------
def test_confirm_creates_provisional_transaction(test_terrain, pro_reservation):
    tok = test_terrain["admin_token"]
    rid = pro_reservation["reservation"]["reservation_id"]
    r = requests.post(f"{BASE_URL}/api/terrain-reservations/{rid}/review",
                      json={"decision": "CONFIRM"}, headers=auth_headers(tok), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "CONFIRMED"
    assert d["transaction_id"]
    tx_id = d["transaction_id"]
    # Check transaction exists in list
    r = requests.get(f"{BASE_URL}/api/finance/transactions", headers=auth_headers(tok), timeout=15)
    assert r.status_code == 200
    tx = next((t for t in r.json()["items"] if t["transaction_id"] == tx_id), None)
    assert tx is not None, "Transaction non trouvée"
    assert tx["status"] == "PROVISIONAL"
    assert tx["direction"] == "IN"
    assert tx["amount"] == 70.0


# ---------- Mark paid => RECORDED ----------
def test_mark_paid_updates_transaction(test_terrain, pro_reservation):
    tok = test_terrain["admin_token"]
    rid = pro_reservation["reservation"]["reservation_id"]
    r = requests.post(f"{BASE_URL}/api/terrain-reservations/{rid}/paid",
                      headers=auth_headers(tok), timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["payment_status"] == "PAID"
    # verify transaction status is RECORDED
    r = requests.get(f"{BASE_URL}/api/finance/transactions", headers=auth_headers(tok), timeout=15)
    tx_id = pro_reservation["reservation"].get("transaction_id")
    # transaction_id was assigned upon confirmation; re-fetch reservation
    rr = requests.get(f"{BASE_URL}/api/terrain-reservations",
                      headers=auth_headers(tok), timeout=15).json()
    res = next(x for x in rr["items"] if x["reservation_id"] == rid)
    tx = next(t for t in r.json()["items"] if t["transaction_id"] == res["transaction_id"])
    assert tx["status"] == "RECORDED"


# ---------- Refuse without comment ----------
def test_refuse_without_comment_400(test_terrain):
    admin_tok = test_terrain["admin_token"]
    pro_tok, _ = _login_direct("pro2.demo@lavoixduchien.fr", "Demo2026!")
    from datetime import datetime, timedelta
    date = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%d")
    r = requests.post(f"{BASE_URL}/api/terrain-reservations",
                      json={"terrain_id": test_terrain["terrain_id"], "date": date,
                            "start_time": "14:00", "end_time": "15:00",
                            "category": "REUNION", "purpose": "TEST_refuse"},
                      headers=auth_headers(pro_tok), timeout=15)
    rid = r.json()["reservation_id"]
    # refuse without comment
    r = requests.post(f"{BASE_URL}/api/terrain-reservations/{rid}/review",
                      json={"decision": "REFUSE"}, headers=auth_headers(admin_tok), timeout=15)
    assert r.status_code == 400
    # refuse with comment
    r = requests.post(f"{BASE_URL}/api/terrain-reservations/{rid}/review",
                      json={"decision": "REFUSE", "comment": "Créneau non compatible"},
                      headers=auth_headers(admin_tok), timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "REFUSED"


# ---------- Conflit de créneau ----------
def test_slot_conflict(test_terrain, pro_reservation):
    """Une réservation qui chevauche un CONFIRMED doit être refusée."""
    pro_tok = pro_reservation["pro_token"]
    date = pro_reservation["date"]
    # créneau qui chevauche 10:00-12:00 (CONFIRMED)
    r = requests.post(f"{BASE_URL}/api/terrain-reservations",
                      json={"terrain_id": test_terrain["terrain_id"], "date": date,
                            "start_time": "11:00", "end_time": "13:00",
                            "category": "SEANCE_SIMPLE", "purpose": "TEST_conflit"},
                      headers=auth_headers(pro_tok), timeout=15)
    assert r.status_code == 400
    assert "déjà réservé" in r.json().get("detail", "").lower() or "reserv" in r.json().get("detail", "").lower()


# ---------- Réservation gratuite ----------
def test_free_reservation_no_transaction(test_terrain):
    admin_tok = test_terrain["admin_token"]
    from datetime import datetime, timedelta
    date = (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%d")
    r = requests.post(f"{BASE_URL}/api/terrain-reservations",
                      json={"terrain_id": test_terrain["terrain_id"], "date": date,
                            "start_time": "09:00", "end_time": "10:00",
                            "category": "COLLECTIVE", "purpose": "TEST_free", "is_free": True},
                      headers=auth_headers(admin_tok), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["amount"] == 0
    assert d["payment_status"] == "FREE"
    rid = d["reservation_id"]
    # confirm => pas de tx
    r = requests.post(f"{BASE_URL}/api/terrain-reservations/{rid}/review",
                      json={"decision": "CONFIRM"}, headers=auth_headers(admin_tok), timeout=15)
    assert r.status_code == 200
    assert r.json().get("transaction_id") is None


# ---------- Agenda unifié : rôles ----------
def test_unified_calendar_admin(test_terrain):
    tok = test_terrain["admin_token"]
    r = requests.get(f"{BASE_URL}/api/calendar/unified", headers=auth_headers(tok), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["google_sync"]["enabled"] is False
    kinds = {i["kind"] for i in d["items"]}
    # Bureau doit voir TERRAIN au moins (nous en avons créé un confirmed)
    assert "TERRAIN" in kinds


def test_unified_calendar_member_no_terrain():
    tok, _ = _login_direct("membre1.demo@lavoixduchien.fr", "Demo2026!")
    if not tok:
        pytest.skip("Member login failed")
    r = requests.get(f"{BASE_URL}/api/calendar/unified", headers=auth_headers(tok), timeout=15)
    assert r.status_code == 200
    kinds = {i["kind"] for i in r.json()["items"]}
    assert "TERRAIN" not in kinds


def test_unified_calendar_pro_own_only(pro_reservation):
    tok = pro_reservation["pro_token"]
    r = requests.get(f"{BASE_URL}/api/calendar/unified", headers=auth_headers(tok), timeout=15)
    assert r.status_code == 200
    for item in r.json()["items"]:
        if item["kind"] == "TERRAIN":
            # own reservation
            assert pro_reservation["reservation"]["requested_by_name"] in item.get("subtitle", "")
