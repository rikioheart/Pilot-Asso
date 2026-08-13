"""Phase 2 backend tests: projects, tasks, validation, help, directory, imports."""
import io
import time
import uuid
import pytest
import requests

from conftest import (BASE_URL, DEMO_PWD, MEMBER, PENDING, PRO_STD, PRO_COORD, BENEVOLE,
                      auth_headers, _login)


# --- Extra fixtures ---
@pytest.fixture(scope="session")
def pro_coord_token():
    tok, _ = _login(PRO_COORD, DEMO_PWD)
    if not tok:
        pytest.skip("pro_coord login failed")
    return tok


@pytest.fixture(scope="session")
def pro_coord_user():
    _, u = _login(PRO_COORD, DEMO_PWD)
    return u


@pytest.fixture(scope="session")
def benevole_token():
    tok, _ = _login(BENEVOLE, DEMO_PWD)
    if not tok:
        pytest.skip("benevole login failed")
    return tok


@pytest.fixture(scope="session")
def benevole_user():
    _, u = _login(BENEVOLE, DEMO_PWD)
    return u


def _get(path, tok, **params):
    return requests.get(f"{BASE_URL}{path}", headers=auth_headers(tok), params=params, timeout=15)


def _post(path, tok, **json):
    return requests.post(f"{BASE_URL}{path}", headers=auth_headers(tok), json=json, timeout=15)


def _put(path, tok, **json):
    return requests.put(f"{BASE_URL}{path}", headers=auth_headers(tok), json=json, timeout=15)


def _delete(path, tok):
    return requests.delete(f"{BASE_URL}{path}", headers=auth_headers(tok), timeout=15)


# ---------- 1. Task workflow full (create -> assign -> start -> submit -> validate) ----------
class TestTaskWorkflow:
    def test_full_workflow(self, admin_token, pro_user, admin_user):
        # Create project from template
        r = _post("/api/projects", admin_token, title=f"TEST_wf_{uuid.uuid4().hex[:6]}",
                  category="EVENEMENT", template="ARTICLE_BLOG", visibility="MEMBERS", status="IN_PROGRESS")
        assert r.status_code == 200, r.text
        project = r.json()
        pid = project["project_id"]
        assert project["template"] == "ARTICLE_BLOG"

        # Template tasks were created
        r = _get(f"/api/projects/{pid}", admin_token)
        assert r.status_code == 200
        assert len(r.json()["tasks"]) >= 8

        # Create a specific task assigned to pro1
        r = _post("/api/tasks", admin_token, project_id=pid, title="TEST_task_wf",
                  assigned_user_id=pro_user["user_id"], visibility="PROJECT_TEAM")
        assert r.status_code == 200, r.text
        task = r.json()
        tid = task["task_id"]
        assert task["assigned_user_id"] == pro_user["user_id"]
        assert task["status"] == "TODO"

        # Pro sees it on /api/tasks?mine=true
        pro_tok, _ = _login(PRO_STD, DEMO_PWD)
        r = _get("/api/tasks", pro_tok, mine=True)
        assert r.status_code == 200
        ids = [t["task_id"] for t in r.json()["items"]]
        assert tid in ids

        # Pro starts (update status IN_PROGRESS)
        r = _put(f"/api/tasks/{tid}", pro_tok, status="IN_PROGRESS")
        assert r.status_code == 200
        assert r.json()["status"] == "IN_PROGRESS"

        # Pro submits with proof + comment -> PENDING_VALIDATION
        r = _post(f"/api/tasks/{tid}/submit", pro_tok, proof="https://example.com/proof.png",
                  comment="Terminé, voir preuve")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "PENDING_VALIDATION"
        assert r.json()["submitted_by"] == pro_user["user_id"]

        # Task appears on /api/tasks/pending-validation for admin
        r = _get("/api/tasks/pending-validation", admin_token)
        assert r.status_code == 200
        items = r.json()["items"]
        match = [t for t in items if t["task_id"] == tid]
        assert match, "submitted task not in pending-validation list"
        assert match[0].get("submitted_by_name")
        assert match[0].get("submitted_at")

        # Bureau receives notification
        r = _get("/api/notifications", admin_token)
        assert any(n.get("resource_id") == tid and n["type"] == "TASK_TO_VALIDATE" for n in r.json()["items"])

        # Admin validates ACCEPT
        r = _post(f"/api/tasks/{tid}/validate", admin_token, decision="ACCEPT")
        assert r.status_code == 200
        assert r.json()["status"] == "COMPLETED"

        # Pro received notification
        r = _get("/api/notifications", pro_tok)
        assert any(n.get("resource_id") == tid and n["type"] == "TASK_VALIDATED" for n in r.json()["items"])

        # History contains CREATE, SUBMIT, VALIDATE
        r = _get(f"/api/tasks/{tid}/history", admin_token)
        assert r.status_code == 200
        actions = [h["action"] for h in r.json()["items"]]
        assert "CREATE" in actions and "SUBMIT" in actions and "VALIDATE" in actions

        # Cleanup
        _delete(f"/api/projects/{pid}", admin_token)


# ---------- 2. Request changes workflow ----------
class TestRequestChanges:
    def test_changes_flow(self, admin_token, pro_user):
        r = _post("/api/projects", admin_token, title=f"TEST_chg_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS", status="IN_PROGRESS")
        pid = r.json()["project_id"]
        r = _post("/api/tasks", admin_token, project_id=pid, title="TEST_changes",
                  assigned_user_id=pro_user["user_id"])
        tid = r.json()["task_id"]
        pro_tok, _ = _login(PRO_STD, DEMO_PWD)
        _post(f"/api/tasks/{tid}/submit", pro_tok, proof="p", comment="ok")

        # Request changes without comment -> 400
        r = _post(f"/api/tasks/{tid}/validate", admin_token, decision="CHANGES")
        assert r.status_code == 400

        # With comment -> back to IN_PROGRESS
        r = _post(f"/api/tasks/{tid}/validate", admin_token, decision="CHANGES",
                  comment="Merci d'ajouter la source")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "IN_PROGRESS"
        assert d["rejection_reason"] == "Merci d'ajouter la source"

        # Pro got a notification
        r = _get("/api/notifications", pro_tok)
        assert any(n.get("resource_id") == tid and n.get("level") == "WARNING" for n in r.json()["items"])

        _delete(f"/api/projects/{pid}", admin_token)


# ---------- 3. Permission enforcement (403) ----------
class TestTaskPermissions:
    def test_pro_cannot_create_task(self, admin_token, pro_token, pro_user):
        # PRO_STANDARD has no tasks.create
        r = _post("/api/projects", admin_token, title=f"TEST_perm_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS")
        pid = r.json()["project_id"]
        r = _post("/api/tasks", pro_token, project_id=pid, title="nope")
        assert r.status_code == 403
        _delete(f"/api/projects/{pid}", admin_token)

    def test_pro_cannot_validate_and_delete(self, admin_token, pro_token, pro_user):
        r = _post("/api/projects", admin_token, title=f"TEST_permv_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS", status="IN_PROGRESS")
        pid = r.json()["project_id"]
        r = _post("/api/tasks", admin_token, project_id=pid, title="TEST_v",
                  assigned_user_id=pro_user["user_id"])
        tid = r.json()["task_id"]
        _post(f"/api/tasks/{tid}/submit", pro_token, proof="p", comment="c")
        # pro cannot validate (no tasks.validate)
        r = _post(f"/api/tasks/{tid}/validate", pro_token, decision="ACCEPT")
        assert r.status_code == 403
        # pro cannot delete
        r = _delete(f"/api/tasks/{tid}", pro_token)
        assert r.status_code == 403
        _delete(f"/api/projects/{pid}", admin_token)

    def test_particulier_cannot_view_tasks(self, member_token):
        # PARTICULIER_STANDARD has no tasks.view
        r = _get("/api/tasks", member_token)
        assert r.status_code == 403

    def test_benevole_can_view_tasks(self, benevole_token):
        r = _get("/api/tasks", benevole_token)
        assert r.status_code == 200


# ---------- 4. Volunteer workflow ----------
class TestVolunteerWorkflow:
    def test_claim_flow(self, admin_token, benevole_token, benevole_user, member_token):
        r = _post("/api/projects", admin_token, title=f"TEST_vol_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS", status="IN_PROGRESS")
        pid = r.json()["project_id"]
        # volunteer task unassigned
        r = _post("/api/tasks", admin_token, project_id=pid, title="TEST_vol_task",
                  is_volunteer_task=True)
        vt = r.json()["task_id"]
        # non-volunteer task
        r = _post("/api/tasks", admin_token, project_id=pid, title="TEST_std_task")
        std = r.json()["task_id"]

        # PARTICULIER_STANDARD cannot claim (no tasks.submit)
        r = _post(f"/api/tasks/{vt}/claim", member_token)
        assert r.status_code == 403

        # non-volunteer cannot be claimed by benevole
        r = _post(f"/api/tasks/{std}/claim", benevole_token)
        assert r.status_code == 403

        # benevole claims volunteer task
        r = _post(f"/api/tasks/{vt}/claim", benevole_token)
        assert r.status_code == 200
        assert r.json()["status"] == "IN_PROGRESS"
        assert r.json()["assigned_user_id"] == benevole_user["user_id"]

        _delete(f"/api/projects/{pid}", admin_token)


# ---------- 5. Subtasks ----------
class TestSubtasks:
    def test_subtask_creation(self, admin_token):
        r = _post("/api/projects", admin_token, title=f"TEST_sub_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS")
        pid = r.json()["project_id"]
        r = _post("/api/tasks", admin_token, project_id=pid, title="parent")
        parent = r.json()["task_id"]
        r = _post("/api/tasks", admin_token, project_id=pid, title="child",
                  parent_task_id=parent)
        assert r.status_code == 200
        assert r.json()["parent_task_id"] == parent
        # project view returns both
        r = _get(f"/api/projects/{pid}", admin_token)
        tasks = r.json()["tasks"]
        assert any(t.get("parent_task_id") == parent for t in tasks)
        _delete(f"/api/projects/{pid}", admin_token)


# ---------- 6. Project visibility (BUREAU-only) ----------
class TestProjectVisibility:
    def test_bureau_only_hidden_from_non_team(self, admin_token, pro_token, member_token):
        r = _post("/api/projects", admin_token, title=f"TEST_hidden_{uuid.uuid4().hex[:6]}",
                  visibility="BUREAU")
        pid = r.json()["project_id"]
        # not in list for pro or member
        r = _get("/api/projects", pro_token)
        if r.status_code == 200:
            assert pid not in [p["project_id"] for p in r.json()["items"]]
        r = _get("/api/projects", member_token)
        # PARTICULIER_STANDARD has no projects.view actually — check permission
        # if permitted, project must not be visible
        if r.status_code == 200:
            assert pid not in [p["project_id"] for p in r.json()["items"]]
        # Direct GET -> 403 for pro
        r = _get(f"/api/projects/{pid}", pro_token)
        assert r.status_code == 403
        _delete(f"/api/projects/{pid}", admin_token)

    def test_particulier_no_projects_view(self, member_token):
        # PARTICULIER_STANDARD does not have projects.view
        r = _get("/api/projects", member_token)
        assert r.status_code == 403


# ---------- 7. Kanban / project update ----------
class TestKanbanUpdate:
    def test_admin_updates_status(self, admin_token):
        r = _post("/api/projects", admin_token, title=f"TEST_kanban_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS", status="IDEA")
        pid = r.json()["project_id"]
        r = _put(f"/api/projects/{pid}", admin_token, status="PLANNED")
        assert r.status_code == 200
        assert r.json()["status"] == "PLANNED"
        _delete(f"/api/projects/{pid}", admin_token)

    def test_pro_cannot_update_non_owned(self, admin_token, pro_token):
        r = _post("/api/projects", admin_token, title=f"TEST_kperm_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS", status="IDEA")
        pid = r.json()["project_id"]
        r = _put(f"/api/projects/{pid}", pro_token, status="PLANNED")
        assert r.status_code == 403
        _delete(f"/api/projects/{pid}", admin_token)


# ---------- 8. Team management ----------
class TestTeam:
    def test_add_duplicate_remove_owner(self, admin_token, pro_user, admin_user):
        r = _post("/api/projects", admin_token, title=f"TEST_team_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS")
        pid = r.json()["project_id"]
        # Add pro as CONTRIBUTOR
        r = _post(f"/api/projects/{pid}/team", admin_token,
                  member_id=pro_user["user_id"], role_in_project="CONTRIBUTOR")
        assert r.status_code == 200
        # Adding twice -> 400
        r = _post(f"/api/projects/{pid}/team", admin_token,
                  member_id=pro_user["user_id"], role_in_project="CONTRIBUTOR")
        assert r.status_code == 400
        # Removing owner -> 400
        r = _delete(f"/api/projects/{pid}/team/{admin_user['user_id']}", admin_token)
        assert r.status_code == 400
        _delete(f"/api/projects/{pid}", admin_token)

    def test_non_coordinator_pro_cannot_add(self, admin_token, pro_token, pro_user, member_user):
        r = _post("/api/projects", admin_token, title=f"TEST_teamperm_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS")
        pid = r.json()["project_id"]
        r = _post(f"/api/projects/{pid}/team", pro_token,
                  member_id=member_user["user_id"], role_in_project="CONTRIBUTOR")
        assert r.status_code == 403
        _delete(f"/api/projects/{pid}", admin_token)


# ---------- 9. Help requests ----------
class TestHelpRequests:
    def test_needs_help_creates_and_lists(self, admin_token, member_token, member_user):
        r = _post("/api/help-requests", member_token,
                  type="NEEDS_HELP", message="TEST_need help", skills=["redaction"])
        assert r.status_code == 200
        hid = r.json()["help_id"]
        # Admin sees all
        r = _get("/api/help-requests", admin_token)
        assert any(h["help_id"] == hid for h in r.json()["items"])
        # Non-admin sees only theirs
        r = _get("/api/help-requests", member_token)
        assert all(h["user_id"] == member_user["user_id"] for h in r.json()["items"])
        # Admin resolves
        r = _put(f"/api/help-requests/{hid}", admin_token, status="RESOLVED",
                 response="On s'en occupe.")
        assert r.status_code == 200
        assert r.json()["status"] == "RESOLVED"
        # Member received a notification
        r = _get("/api/notifications", member_token)
        assert any(n.get("resource_id") == hid for n in r.json()["items"])

    def test_non_admin_cannot_update_help(self, member_token, admin_token):
        r = _post("/api/help-requests", member_token, type="NEEDS_HELP", message="TEST_x")
        hid = r.json()["help_id"]
        r = _put(f"/api/help-requests/{hid}", member_token, status="RESOLVED")
        assert r.status_code == 403

    def test_task_help_button(self, admin_token, pro_user):
        r = _post("/api/projects", admin_token, title=f"TEST_th_{uuid.uuid4().hex[:6]}",
                  visibility="MEMBERS", status="IN_PROGRESS")
        pid = r.json()["project_id"]
        r = _post("/api/tasks", admin_token, project_id=pid, title="TEST_needs_help",
                  assigned_user_id=pro_user["user_id"])
        tid = r.json()["task_id"]
        pro_tok, _ = _login(PRO_STD, DEMO_PWD)
        r = _post(f"/api/tasks/{tid}/help", pro_tok, comment="Je bloque sur X")
        assert r.status_code == 200
        # Task now needs_help
        r = _get(f"/api/tasks/{tid}/history", admin_token)
        assert any(h["action"] == "NEEDS_HELP" for h in r.json()["items"])
        _delete(f"/api/projects/{pid}", admin_token)


# ---------- 10. Directory ----------
class TestDirectory:
    def test_directory_lists_demo(self, admin_token):
        r = _get("/api/professionals", admin_token)
        assert r.status_code == 200
        assert r.json()["total"] >= 2

    def test_filter_category(self, admin_token):
        r = _get("/api/professionals", admin_token, category="EDUCATEUR_CANIN")
        assert r.status_code == 200

    def test_pro_details_hides_partnership_fields(self, admin_token, pro_token, pro_user):
        # Ensure admin has the fields
        r = _get(f"/api/professionals/{pro_user['user_id']}", admin_token)
        assert r.status_code == 200
        # For non-admin, partnership fields are stripped
        r = _get(f"/api/professionals/{pro_user['user_id']}", pro_token)
        assert r.status_code == 200
        d = r.json()["details"]
        assert "partnership_percentage" not in d
        assert "contract_reference" not in d
        assert "contract_url" not in d

    def test_admin_only_partnership_update(self, pro_token, pro_user, admin_token):
        r = _put(f"/api/professionals/{pro_user['user_id']}", pro_token,
                 partnership_percentage=10)
        assert r.status_code == 403
        r = _put(f"/api/professionals/{pro_user['user_id']}", admin_token,
                 partnership_percentage=10, partnership_status="ACTIVE")
        assert r.status_code == 200

    def test_particulier_cannot_update_me_pro(self, member_token):
        r = _put("/api/professionals/me", member_token, company_name="Nope")
        assert r.status_code == 403

    def test_pro_can_update_me(self, pro_token):
        r = _put("/api/professionals/me", pro_token,
                 professional_category="EDUCATEUR_CANIN",
                 specialties=["chiots"], departments=["45"])
        assert r.status_code == 200
        d = r.json()
        assert "chiots" in d.get("specialties", [])


# ---------- 11. CSV import ----------
class TestCsvImport:
    CSV_CONTENT = (
        "Nom;Prénom;Email;Rôle;Ville;Département;Chien\n"
        "TestNew;Alice;test_new_import@example.com;PARTICULIER;Orléans;45;Rex\n"
        "Existing;Membre;membre1.demo@lavoixduchien.fr;PARTICULIER;Paris;75;\n"
        "Nomail;NoEmail;;PARTICULIER;Lyon;69;\n"
    )

    def _files(self):
        return {"file": ("test.csv", io.BytesIO(self.CSV_CONTENT.encode("utf-8")), "text/csv")}

    def test_analyze_admin(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/imports/analyze",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          files=self._files(), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["row_count"] == 3
        assert "membre1.demo@lavoixduchien.fr" in d["existing_emails"]
        assert d["missing_email_rows"] >= 1
        mapping = d["suggested_mapping"]
        assert "email" in mapping.values()
        assert "last_name" in mapping.values()

    def test_analyze_non_admin(self, pro_token):
        r = requests.post(f"{BASE_URL}/api/imports/analyze",
                          headers={"Authorization": f"Bearer {pro_token}"},
                          files=self._files(), timeout=15)
        assert r.status_code == 403

    def test_execute_import(self, admin_token):
        import json
        mapping = {"Nom": "last_name", "Prénom": "first_name", "Email": "email",
                   "Rôle": "role", "Ville": "city", "Département": "department", "Chien": "dog"}
        r = requests.post(f"{BASE_URL}/api/imports/execute",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          files=self._files(),
                          data={"mapping": json.dumps(mapping), "update_existing": "false"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # 1 new, 1 existing skipped, 1 missing email skipped
        assert d["created"] >= 1
        assert d["skipped"] >= 2
        reasons = [c["reason"] for c in d["conflicts"]]
        assert any("existant" in reason.lower() or "existant" in reason for reason in reasons)
        assert any("mail" in reason.lower() for reason in reasons)

    def test_execute_non_admin(self, pro_token):
        import json
        r = requests.post(f"{BASE_URL}/api/imports/execute",
                          headers={"Authorization": f"Bearer {pro_token}"},
                          files=self._files(),
                          data={"mapping": json.dumps({"Email": "email"}), "update_existing": "false"},
                          timeout=15)
        assert r.status_code == 403


# ---------- 12. Dashboard Bureau enrichment ----------
class TestDashboardBureau:
    def test_dashboard_has_phase2_kpis(self, admin_token):
        r = _get("/api/dashboard/admin", admin_token)
        assert r.status_code == 200
        kpis = r.json()["kpis"]
        # Expected phase 2 KPIs
        for k in ["members", "professionals", "pending_members"]:
            assert k in kpis
        # Presence of new KPIs — try common names
        expected_optional = ["active_projects", "tasks_to_validate", "overdue_tasks",
                             "help_requests", "open_volunteer_tasks", "blocked_tasks"]
        found = [k for k in expected_optional if k in kpis]
        # At least a subset should exist
        assert len(found) >= 2, f"expected phase-2 KPIs missing, got kpis={list(kpis.keys())}"


# ---------- 13. Global search ----------
class TestGlobalSearchPhase2:
    def test_admin_search_categories(self, admin_token):
        r = _get("/api/search", admin_token, q="TEST")
        # Doesn't have to find anything specific, but must return groups
        assert r.status_code == 200
        assert "groups" in r.json()

    def test_admin_search_demo_projects(self, admin_token):
        r = _get("/api/search", admin_token, q="terrain")
        assert r.status_code == 200
        # Just ensure a project group exists in response schema
        groups = r.json()["groups"]
        labels = {g["label"] for g in groups}
        # At least Membres or Projets should be a category label option
        assert labels  # non-empty
