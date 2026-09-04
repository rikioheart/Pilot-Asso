"""Prompt 8 Lot B — Dashboards conditionnels, préférences view_modes, empty-states."""
import requests
from conftest import BASE_URL, auth_headers


# --- Dashboards ---

def test_dashboard_member(member_token):
    r = requests.get(f"{BASE_URL}/api/dashboard/member", headers=auth_headers(member_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "dog_cards" in d and isinstance(d["dog_cards"], list)
    assert "next_items" in d and isinstance(d["next_items"], list)
    assert "my_projects" in d
    assert len(d["next_items"]) <= 3
    for dc in d["dog_cards"]:
        assert "name" in dc
        assert "last_report" in dc
        assert "next_appointment" in dc


def test_dashboard_pro(pro_token):
    r = requests.get(f"{BASE_URL}/api/dashboard/pro", headers=auth_headers(pro_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["today", "week_end", "today_activities", "week_activities",
              "week_events", "low_stock", "connections", "my_documents_count"]:
        assert k in d, f"missing key {k}"
    assert "google_calendar" in d["connections"]
    assert "rintintin" in d["connections"]


def test_dashboard_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/dashboard/admin", headers=auth_headers(admin_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["upcoming_activities", "upcoming_events_list", "activities_review_list",
              "pros_list", "recent_reviews", "recent_members"]:
        assert k in d, f"missing key {k}"
    for p in d["pros_list"]:
        assert "company_name" in p
        assert "partnership_status" in p
        assert "activities" in p


# --- Preferences view_modes ---

def test_preferences_view_modes_persist(member_token):
    payload = {"view_modes": {"tasks": "table", "cockpit": "pros"}}
    r = requests.put(f"{BASE_URL}/api/profiles/me/preferences",
                     headers=auth_headers(member_token), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    # Verify persistence via /api/auth/me
    r2 = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(member_token), timeout=15)
    assert r2.status_code == 200
    body = r2.json()
    profile = body.get("profile") or body
    prefs = profile.get("preferences") or {}
    vm = prefs.get("view_modes") or {}
    assert vm.get("tasks") == "table"
    assert vm.get("cockpit") == "pros"


# --- Empty states ---

def test_empty_states_get_member(member_token):
    r = requests.get(f"{BASE_URL}/api/settings/empty-states",
                     headers=auth_headers(member_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "modules" in d and "roles" in d and "messages" in d


def test_empty_states_put_admin_sets_and_resets(admin_token):
    payload = {"messages": {"tasks": {"PARTICULIER": {
        "message": "Pas encore de mission [TEST]",
        "action_label": "Voir les activités",
        "action_link": "/activities"
    }}}}
    r = requests.put(f"{BASE_URL}/api/settings/empty-states",
                     headers=auth_headers(admin_token), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    msgs = r.json()["messages"]
    assert msgs["tasks"]["PARTICULIER"]["message"] == "Pas encore de mission [TEST]"

    # Bad module
    r2 = requests.put(f"{BASE_URL}/api/settings/empty-states",
                      headers=auth_headers(admin_token),
                      json={"messages": {"nonexistent": {"PARTICULIER": {"message": "x"}}}},
                      timeout=15)
    assert r2.status_code == 400

    # Cleanup - restore empty
    r3 = requests.put(f"{BASE_URL}/api/settings/empty-states",
                      headers=auth_headers(admin_token), json={"messages": {}}, timeout=15)
    assert r3.status_code == 200


def test_empty_states_put_forbidden_for_pro(pro_token):
    r = requests.put(f"{BASE_URL}/api/settings/empty-states",
                     headers=auth_headers(pro_token),
                     json={"messages": {}}, timeout=15)
    assert r.status_code == 403


# --- Cleanup: reset preferences to defaults ---

def test_zzz_reset_member_preferences(member_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/preferences",
                     headers=auth_headers(member_token),
                     json={"view_modes": {"tasks": "kanban", "projects": "kanban",
                                          "stock": "kanban", "documents": "kanban",
                                          "cockpit": "global"}}, timeout=15)
    assert r.status_code == 200
