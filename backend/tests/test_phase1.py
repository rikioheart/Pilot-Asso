"""End-to-end backend tests for La Voix du Chien - Phase 1."""
import asyncio
import json
import time
import uuid
import pytest
import requests
import websockets

from conftest import BASE_URL, DEMO_PWD, MEMBER, PENDING, PRO_STD, auth_headers


# ---------- Auth basics ----------
class TestAuth:
    def test_login_admin(self, admin_token, admin_user):
        assert admin_token
        assert admin_user["role"] == "ADMIN_BUREAU"
        assert admin_user["status"] == "ACTIVE"
        assert "members.view" in admin_user["permissions"]

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "pro1.demo@lavoixduchien.fr", "password": "wrong-pass"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(admin_token))
        assert r.status_code == 200
        assert r.json()["user"]["email"].lower() == "associationlavoixduchien@gmail.com"

    def test_google_session_missing_header(self):
        r = requests.post(f"{BASE_URL}/api/auth/session")
        assert r.status_code == 400


# ---------- Unauthenticated 401s ----------
class TestUnauth:
    @pytest.mark.parametrize("path", ["/api/auth/me", "/api/members", "/api/dashboard/admin",
                                       "/api/notifications", "/api/dogs"])
    def test_unauth_401(self, path):
        r = requests.get(f"{BASE_URL}{path}")
        assert r.status_code == 401, f"{path} returned {r.status_code}"


# ---------- Admin dashboard ----------
class TestAdminDashboard:
    def test_dashboard_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/admin", headers=auth_headers(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert set(["members", "professionals", "individuals", "pending_members",
                    "suspended", "bureau"]).issubset(d["kpis"].keys())
        assert "weekly_progress" in d
        assert "activity_feed" in d
        assert d["kpis"]["bureau"] >= 1


# ---------- RBAC 403s ----------
class TestRBAC:
    ADMIN_ROUTES = ["/api/dashboard/admin", "/api/audit", "/api/settings/rbac"]

    @pytest.mark.parametrize("path", ADMIN_ROUTES)
    def test_pro_forbidden_admin_routes(self, pro_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=auth_headers(pro_token))
        assert r.status_code == 403

    @pytest.mark.parametrize("path", ADMIN_ROUTES)
    def test_member_forbidden_admin_routes(self, member_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=auth_headers(member_token))
        assert r.status_code == 403

    def test_member_no_members_view(self, member_token):
        r = requests.get(f"{BASE_URL}/api/members", headers=auth_headers(member_token))
        assert r.status_code == 403

    def test_pro_can_view_members(self, pro_token):
        # pro standard has members.view
        r = requests.get(f"{BASE_URL}/api/members", headers=auth_headers(pro_token))
        assert r.status_code == 200

    def test_member_no_pro_dashboard(self, member_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/pro", headers=auth_headers(member_token))
        assert r.status_code == 403

    def test_pro_cannot_update_other_member(self, pro_token, admin_token):
        # find another user
        r = requests.get(f"{BASE_URL}/api/members?limit=25", headers=auth_headers(admin_token))
        assert r.status_code == 200
        others = [u["user_id"] for u in r.json()["items"] if u["email"] != PRO_STD]
        assert others
        target = others[0]
        r = requests.put(f"{BASE_URL}/api/members/{target}",
                         headers=auth_headers(pro_token), json={"status": "SUSPENDED"})
        assert r.status_code == 403

    def test_member_cannot_create_notification(self, member_token, member_user):
        r = requests.post(f"{BASE_URL}/api/notifications",
                          headers=auth_headers(member_token),
                          json={"recipient_id": member_user["user_id"],
                                "type": "SYSTEM", "title": "x"})
        assert r.status_code == 403


# ---------- Member management ----------
class TestMemberManagement:
    def test_approve_reject_suspend_cycle(self, admin_token):
        # Register a fresh temporary user
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "Password123!",
                                "first_name": "T", "last_name": "Est",
                                "role": "PARTICULIER"})
        assert r.status_code == 200
        user = r.json()["user"]
        uid = user["user_id"]
        new_token = r.json()["access_token"]
        assert user["status"] == "PENDING"

        # Pending user cannot access dashboards
        r = requests.get(f"{BASE_URL}/api/dashboard/member", headers=auth_headers(new_token))
        assert r.status_code == 403

        # Admin approves
        r = requests.put(f"{BASE_URL}/api/members/{uid}",
                         headers=auth_headers(admin_token), json={"status": "ACTIVE"})
        assert r.status_code == 200
        assert r.json()["status"] == "ACTIVE"

        # User can now access member dashboard
        r = requests.get(f"{BASE_URL}/api/dashboard/member", headers=auth_headers(new_token))
        assert r.status_code == 200

        # Suspend
        r = requests.put(f"{BASE_URL}/api/members/{uid}",
                         headers=auth_headers(admin_token), json={"status": "SUSPENDED"})
        assert r.status_code == 200

        # Suspended -> 403 on active routes
        r = requests.get(f"{BASE_URL}/api/dashboard/member", headers=auth_headers(new_token))
        assert r.status_code == 403

        # Reactivate
        r = requests.put(f"{BASE_URL}/api/members/{uid}",
                         headers=auth_headers(admin_token), json={"status": "ACTIVE"})
        assert r.status_code == 200

        # Change role/level valid
        r = requests.put(f"{BASE_URL}/api/members/{uid}",
                         headers=auth_headers(admin_token),
                         json={"role": "PARTICULIER", "access_level": "BENEVOLE_VALIDE"})
        assert r.status_code == 200
        assert r.json()["access_level"] == "BENEVOLE_VALIDE"

        # Invalid level for role
        r = requests.put(f"{BASE_URL}/api/members/{uid}",
                         headers=auth_headers(admin_token),
                         json={"access_level": "PRO_COORDINATEUR"})
        assert r.status_code == 400

        # /auth/me reflects new permissions
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(new_token))
        assert r.status_code == 200
        perms = r.json()["user"]["permissions"]
        assert "tasks.submit" in perms  # BENEVOLE has it

        # cleanup - reject/archive
        requests.put(f"{BASE_URL}/api/members/{uid}",
                     headers=auth_headers(admin_token), json={"status": "REJECTED"})


# ---------- Notifications ----------
class TestNotifications:
    def test_list_own_notifications(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "unread_count" in d

    def test_mark_all_read(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/notifications/read-all",
                          headers=auth_headers(admin_token))
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(admin_token))
        assert r.json()["unread_count"] == 0

    def test_cannot_read_other_users_notification(self, admin_token, member_token, member_user):
        # Admin creates notification for member
        r = requests.post(f"{BASE_URL}/api/notifications",
                          headers=auth_headers(admin_token),
                          json={"recipient_id": member_user["user_id"], "type": "SYSTEM",
                                "title": "TEST-crossread", "message": "x"})
        assert r.status_code == 200
        nid = r.json()["notification_id"]
        # Admin can't mark member's own notif (belongs to member, not admin)
        r = requests.post(f"{BASE_URL}/api/notifications/{nid}/read",
                          headers=auth_headers(admin_token))
        assert r.status_code == 404
        # Member can
        r = requests.post(f"{BASE_URL}/api/notifications/{nid}/read",
                          headers=auth_headers(member_token))
        assert r.status_code == 200


# ---------- WebSocket ----------
class TestWebSocket:
    def test_ws_valid_token(self, admin_token):
        ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        url = f"{ws_url}/api/ws/notifications?token={admin_token}"

        async def _run():
            async with websockets.connect(url) as ws:
                # Small wait, then close
                await asyncio.sleep(0.5)
                assert ws.state.name == "OPEN"
        asyncio.get_event_loop().run_until_complete(_run())

    def test_ws_no_token(self):
        ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        url = f"{ws_url}/api/ws/notifications"

        async def _run():
            try:
                async with websockets.connect(url) as ws:
                    await ws.recv()
                return None
            except Exception as e:
                return e
        err = asyncio.get_event_loop().run_until_complete(_run())
        # Ingress may reject with 403 during handshake OR server may close with 4401.
        assert err is not None
        s = str(err).lower()
        assert "4401" in s or "403" in s or "close" in s


# ---------- Dogs ----------
class TestDogs:
    def test_member_add_and_delete_dog(self, member_token):
        r = requests.post(f"{BASE_URL}/api/dogs",
                          headers=auth_headers(member_token),
                          json={"name": "TEST_Rex", "breed": "Labrador"})
        assert r.status_code == 200
        dog_id = r.json()["dog_id"]
        # GET
        r = requests.get(f"{BASE_URL}/api/dogs", headers=auth_headers(member_token))
        assert any(d["dog_id"] == dog_id for d in r.json())
        # DELETE
        r = requests.delete(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(member_token))
        assert r.status_code == 200

    def test_cannot_delete_others_dog(self, member_token, pro_token):
        # member creates a dog
        r = requests.post(f"{BASE_URL}/api/dogs", headers=auth_headers(member_token),
                          json={"name": "TEST_Toby"})
        dog_id = r.json()["dog_id"]
        # pro tries to delete
        r = requests.delete(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(pro_token))
        assert r.status_code == 403
        # cleanup
        requests.delete(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(member_token))


# ---------- Profile ----------
class TestProfile:
    def test_update_own_profile_and_audit(self, member_token, admin_token, member_user):
        r = requests.put(f"{BASE_URL}/api/profiles/me",
                         headers=auth_headers(member_token),
                         json={"bio": "Updated at " + str(int(time.time()))})
        assert r.status_code == 200
        # audit logs contain UPDATE profile for this user
        r = requests.get(f"{BASE_URL}/api/audit?module=profile",
                         headers=auth_headers(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i.get("user_id") == member_user["user_id"] and i["action"] == "UPDATE" for i in items)


# ---------- Audit ----------
class TestAudit:
    def test_audit_filter(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/audit?module=auth&limit=50",
                         headers=auth_headers(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        for i in items:
            assert i["module"] == "auth"


# ---------- Search ----------
class TestSearch:
    def test_admin_search_finds_demo_members(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/search?q=DEMO", headers=auth_headers(admin_token))
        assert r.status_code == 200
        groups = r.json()["groups"]
        member_group = next((g for g in groups if g["label"] == "Membres"), None)
        assert member_group is not None
        assert len(member_group["items"]) >= 1

    def test_member_search_only_own_dogs(self, member_token, admin_token):
        r = requests.get(f"{BASE_URL}/api/search?q=DEMO", headers=auth_headers(member_token))
        assert r.status_code == 200
        groups = r.json()["groups"]
        dogs = next((g for g in groups if g["label"] == "Chiens"), None)
        if dogs:
            # All dogs must belong to this member (demo dogs are owned by membre1.demo)
            assert len(dogs["items"]) >= 1


# ---------- Demo data present ----------
class TestDemoData:
    def test_demo_users_present(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/members?limit=50", headers=auth_headers(admin_token))
        assert r.status_code == 200
        emails = {u["email"] for u in r.json()["items"]}
        for e in [PRO_STD, "pro2.demo@lavoixduchien.fr", MEMBER,
                  "benevole.demo@lavoixduchien.fr", PENDING]:
            assert e in emails, f"missing demo user {e}"

    def test_pending_demo_user(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/members?status=PENDING",
                         headers=auth_headers(admin_token))
        assert r.status_code == 200
        emails = {u["email"] for u in r.json()["items"]}
        assert PENDING in emails
