"""Prompts 4/5/6 — RBAC loyalty PRO_STANDARD, Stocks (catégories/mouvements/finance/liens/delete),
Documents (visibility PRO_BUREAU/BUREAU, catégories), Job sheets, Guides, Help center,
Suivi qualitatif, Récap annuel Excel."""
import os
import time
import uuid

import pytest
import requests

from conftest import BASE_URL, DEMO_PWD, PRO_STD, MEMBER, auth_headers, _login

PRO_COORD_EMAIL = "pro2.demo@lavoixduchien.fr"

TEST_TAG = f"TEST_p6_{uuid.uuid4().hex[:6]}"


# ---------- shared session-scoped tokens ----------
@pytest.fixture(scope="module")
def pro_coord_token():
    tok, _ = _login(PRO_COORD_EMAIL, DEMO_PWD)
    if not tok:
        pytest.skip("pro2 login failed")
    return tok


@pytest.fixture(scope="module")
def pro_coord_user():
    _, u = _login(PRO_COORD_EMAIL, DEMO_PWD)
    return u


# ============================================================ RBAC LOYALTY
class TestLoyaltyRBAC:
    """PRO_STANDARD doit désormais avoir loyalty.stamp (Prompt 4 complément)."""

    def test_pro_standard_can_scan_and_stamp(self, admin_token, pro_token, pro_user, member_user):
        # 1. Get member card qr_token via admin
        r = requests.get(f"{BASE_URL}/api/loyalty/members", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        members = r.json().get("items", [])
        target = next((m for m in members if m.get("user_id") == member_user["user_id"]), None)
        if not target:
            pytest.skip("Member card not found")
        # get qr from card list (admin can see cards)
        r = requests.get(f"{BASE_URL}/api/loyalty/cards/{target['user_id']}", headers=auth_headers(admin_token), timeout=15)
        # fallback: use pro scan by user via /api/loyalty/search
        # 2. PRO_STANDARD calls /api/loyalty/search
        r = requests.get(f"{BASE_URL}/api/loyalty/search?q={member_user['first_name'][:3] if member_user.get('first_name') else 'mem'}",
                         headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 200, f"PRO_STANDARD refusé sur /loyalty/search: {r.status_code} {r.text[:200]}"

        # 3. PRO_STANDARD stamps via user_id + no activity => 400 expected but permission OK (not 403)
        r = requests.post(f"{BASE_URL}/api/loyalty/stamp",
                          headers=auth_headers(pro_token),
                          json={"user_id": member_user["user_id"]}, timeout=15)
        assert r.status_code != 403, f"PRO_STANDARD ne doit plus recevoir 403 sur /loyalty/stamp: {r.text[:200]}"

    def test_pro_standard_scan_endpoint(self, pro_token):
        r = requests.post(f"{BASE_URL}/api/loyalty/scan",
                          headers=auth_headers(pro_token), json={"qr_token": "invalid"}, timeout=15)
        # Should be 400 or 404, not 403
        assert r.status_code in (400, 404), f"Expected 400/404, got {r.status_code}: {r.text[:200]}"


# ============================================================ STOCK
class TestStock:
    created_items = []
    created_cats = []

    def test_stock_meta_defaults(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/stock/meta", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        cat_names = {c["name"] for c in d["categories"]}
        for expected in ["Mastication", "Jeux", "Olfaction", "Sport physique", "Événement",
                         "Produits partenaires", "Document ou flyer", "Autre"]:
            assert expected in cat_names, f"Catégorie par défaut manquante: {expected}"
        assert set(d["payment_methods"]) == {"ESPECES", "VIREMENT", "CARTE", "DON", "AUTRE"}
        assert d["payment_labels"]["ESPECES"] == "Espèces"
        assert d["payment_labels"]["VIREMENT"] == "Virement"

    def test_stock_item_unknown_category_rejected(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/stock/items", headers=auth_headers(admin_token),
                          json={"name": f"{TEST_TAG}_bad", "category": "CATEGORIE_INCONNUE"}, timeout=15)
        assert r.status_code == 400
        assert "Catégorie" in r.text or "inconnue" in r.text

    def test_stock_create_category_and_item(self, admin_token):
        cat_name = f"{TEST_TAG}_cat_A"
        r = requests.post(f"{BASE_URL}/api/stock/categories", headers=auth_headers(admin_token),
                          json={"name": cat_name, "description": "TEST"}, timeout=15)
        assert r.status_code == 200, r.text
        cat = r.json()
        TestStock.created_cats.append(cat["category_id"])

        r = requests.post(f"{BASE_URL}/api/stock/items", headers=auth_headers(admin_token),
                          json={"name": f"{TEST_TAG}_item1", "category": cat_name,
                                "quantity": 10, "unit_cost": 5.0}, timeout=15)
        assert r.status_code == 200, r.text
        item = r.json()
        TestStock.created_items.append(item["item_id"])
        assert item["category"] == cat_name

    def test_stock_rename_category_propagates(self, admin_token):
        assert TestStock.created_cats, "no cat"
        cat_id = TestStock.created_cats[0]
        new_name = f"{TEST_TAG}_cat_A_renamed"
        r = requests.put(f"{BASE_URL}/api/stock/categories/{cat_id}", headers=auth_headers(admin_token),
                         json={"name": new_name, "description": "renamed"}, timeout=15)
        assert r.status_code == 200, r.text
        # Verify article now has new category
        r = requests.get(f"{BASE_URL}/api/stock/items?q={TEST_TAG}_item1",
                         headers=auth_headers(admin_token), timeout=15)
        items = r.json()["items"]
        assert any(i["category"] == new_name for i in items), "Rename didn't propagate"

    def test_stock_movement_with_payment(self, admin_token):
        assert TestStock.created_items
        item_id = TestStock.created_items[0]
        r = requests.post(f"{BASE_URL}/api/stock/items/{item_id}/movements",
                          headers=auth_headers(admin_token),
                          json={"direction": "OUT", "quantity": 2, "reason": f"{TEST_TAG}_out",
                                "payment_method": "ESPECES", "date": "2025-06-15", "amount": 15.0},
                          timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["payment_method"] == "ESPECES"
        assert m["payment_label"] == "Espèces"
        assert m["date"] == "2025-06-15"
        assert m["amount"] == 15.0

    def test_stock_movement_invalid_payment(self, admin_token):
        item_id = TestStock.created_items[0]
        r = requests.post(f"{BASE_URL}/api/stock/items/{item_id}/movements",
                          headers=auth_headers(admin_token),
                          json={"direction": "IN", "quantity": 1, "payment_method": "BITCOIN"},
                          timeout=15)
        assert r.status_code == 400

    def test_stock_movements_list(self, admin_token):
        item_id = TestStock.created_items[0]
        r = requests.get(f"{BASE_URL}/api/stock/movements?item_id={item_id}",
                         headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_stock_finance_summary(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/stock/finance-summary",
                         headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "by_method" in d and "total_amount" in d and "stock_value" in d
        # Our ESPECES movement should be counted
        methods = {b["method"]: b for b in d["by_method"]}
        assert "ESPECES" in methods, f"ESPECES not aggregated: {methods.keys()}"
        assert methods["ESPECES"]["amount"] >= 15.0

    def test_stock_link_to_project(self, admin_token):
        # find a project
        r = requests.get(f"{BASE_URL}/api/projects", headers=auth_headers(admin_token), timeout=15)
        projects = r.json().get("items", []) if r.status_code == 200 else []
        if not projects:
            pytest.skip("No project available")
        pid = projects[0]["project_id"]
        item_id = TestStock.created_items[0]
        r = requests.put(f"{BASE_URL}/api/stock/items/{item_id}",
                         headers=auth_headers(admin_token), json={"project_id": pid}, timeout=15)
        assert r.status_code == 200
        # Verify list returns project_title
        r = requests.get(f"{BASE_URL}/api/stock/items?q={TEST_TAG}_item1",
                         headers=auth_headers(admin_token), timeout=15)
        it = next((i for i in r.json()["items"] if i["item_id"] == item_id), None)
        assert it and it.get("project_title"), "project_title missing"
        # Reverse lookup
        r = requests.get(f"{BASE_URL}/api/stock/linked?project_id={pid}",
                         headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert any(i["item_id"] == item_id for i in r.json()["items"])

    def test_stock_delete_archive_then_hard(self, admin_token):
        # Create a throwaway item
        cat_name = f"{TEST_TAG}_cat_A_renamed"
        r = requests.post(f"{BASE_URL}/api/stock/items", headers=auth_headers(admin_token),
                          json={"name": f"{TEST_TAG}_todelete", "category": cat_name}, timeout=15)
        assert r.status_code == 200
        iid = r.json()["item_id"]
        # Archive
        r = requests.delete(f"{BASE_URL}/api/stock/items/{iid}?reason=TEST_archive",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert "archivé" in r.json()["message"].lower()
        # Hard
        r = requests.delete(f"{BASE_URL}/api/stock/items/{iid}?reason=TEST_hard&hard=true",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert "définitivement" in r.json()["message"].lower()
        # audit trace
        time.sleep(0.5)
        r = requests.get(f"{BASE_URL}/api/audit?module=stock&limit=20",
                         headers=auth_headers(admin_token), timeout=15)
        if r.status_code == 200:
            actions = [a.get("action") for a in r.json().get("items", [])]
            assert "DELETE" in actions, f"No DELETE in audit: {actions[:10]}"


# ============================================================ DOCUMENTS
class TestDocuments:
    doc_id = None
    doc_cat_id = None

    def test_documents_meta(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/documents/meta", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "FACTURE" in d["proof_types"]
        assert "BUREAU" in d["visibilities"]
        assert "PRO_BUREAU" in d["visibilities"]
        assert "SHARED" in d["visibilities"]
        assert d["visibility_labels"]["PRO_BUREAU"] == "Professionnels + Bureau"
        assert d["proof_labels"]["FACTURE"] == "Facture"

    def test_document_category_crud(self, admin_token):
        label = f"{TEST_TAG}_DocCat"
        r = requests.post(f"{BASE_URL}/api/documents/categories", headers=auth_headers(admin_token),
                          json={"label": label}, timeout=15)
        assert r.status_code == 200, r.text
        TestDocuments.doc_cat_id = r.json()["doc_category_id"]
        # Rename
        r = requests.put(f"{BASE_URL}/api/documents/categories/{TestDocuments.doc_cat_id}",
                         headers=auth_headers(admin_token), json={"label": label + "_v2"}, timeout=15)
        assert r.status_code == 200
        # Delete (no docs using it)
        r = requests.delete(f"{BASE_URL}/api/documents/categories/{TestDocuments.doc_cat_id}",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200

    def _upload_stub_file(self, admin_token) -> str:
        """Upload a tiny text file to /api/uploads and return file_id."""
        files = {"file": (f"{TEST_TAG}.txt", b"TEST content", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/files/upload?usage=OTHER",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          files=files, timeout=20)
        if r.status_code != 200:
            pytest.skip(f"upload endpoint unavailable: {r.status_code}")
        return r.json().get("file_id") or r.json().get("id")

    def test_create_document_pro_bureau_visibility(self, admin_token, pro_token, member_token):
        fid = self._upload_stub_file(admin_token)
        r = requests.post(f"{BASE_URL}/api/documents", headers=auth_headers(admin_token),
                          json={"title": f"{TEST_TAG}_ProBureau", "category": "AUTRE",
                                "file_id": fid, "proof_type": "FACTURE",
                                "visibility": "PRO_BUREAU"}, timeout=15)
        assert r.status_code == 200, f"create doc failed: {r.status_code} {r.text[:300]} fid={fid}"
        TestDocuments.doc_id = r.json()["document_id"]

        # Pro sees it
        r = requests.get(f"{BASE_URL}/api/documents?q={TEST_TAG}_ProBureau",
                         headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 200
        titles = [d["title"] for d in r.json()["items"]]
        assert any(TEST_TAG in t for t in titles), f"Pro doesn't see PRO_BUREAU doc"

        # Member does NOT see it — members don't have documents.view permission => 403 acceptable,
        # otherwise 200 with empty list.
        r = requests.get(f"{BASE_URL}/api/documents?q={TEST_TAG}_ProBureau",
                         headers=auth_headers(member_token), timeout=15)
        if r.status_code == 200:
            assert not any(TEST_TAG in d["title"] for d in r.json()["items"]), "Member should not see PRO_BUREAU"
        else:
            assert r.status_code == 403

    def test_update_document_change_visibility(self, admin_token, pro_token):
        assert TestDocuments.doc_id
        r = requests.put(f"{BASE_URL}/api/documents/{TestDocuments.doc_id}",
                         headers=auth_headers(admin_token),
                         json={"visibility": "BUREAU", "proof_type": "RECU"}, timeout=15)
        assert r.status_code == 200
        # Pro no longer sees it
        r = requests.get(f"{BASE_URL}/api/documents?q={TEST_TAG}_ProBureau",
                         headers=auth_headers(pro_token), timeout=15)
        assert not any(d["document_id"] == TestDocuments.doc_id for d in r.json()["items"])
        # Invalid visibility
        r = requests.put(f"{BASE_URL}/api/documents/{TestDocuments.doc_id}",
                         headers=auth_headers(admin_token), json={"visibility": "WORLD"}, timeout=15)
        assert r.status_code == 400
        r = requests.put(f"{BASE_URL}/api/documents/{TestDocuments.doc_id}",
                         headers=auth_headers(admin_token), json={"proof_type": "XX"}, timeout=15)
        assert r.status_code == 400

    def test_delete_document_archive_and_hard(self, admin_token):
        assert TestDocuments.doc_id
        r = requests.delete(f"{BASE_URL}/api/documents/{TestDocuments.doc_id}?reason=TEST_arch",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        r = requests.delete(f"{BASE_URL}/api/documents/{TestDocuments.doc_id}?reason=TEST_hard&hard=true",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200


# ============================================================ JOB SHEETS
class TestJobSheets:
    sheet_id = None

    def test_create_job_sheet_bureau(self, admin_token, member_user):
        r = requests.post(f"{BASE_URL}/api/job-sheets", headers=auth_headers(admin_token),
                          json={"member_id": member_user["user_id"],
                                "role_title": f"{TEST_TAG}_Role",
                                "responsibilities": "Test resp",
                                "daily_actions": "Test daily",
                                "modules": ["ACCUEIL"],
                                "visibility": "PRO_BUREAU"}, timeout=15)
        assert r.status_code == 200, r.text
        TestJobSheets.sheet_id = r.json()["document_id"]

    def test_pro_forbidden_creates_job_sheet(self, pro_token, member_user):
        r = requests.post(f"{BASE_URL}/api/job-sheets", headers=auth_headers(pro_token),
                          json={"member_id": member_user["user_id"], "role_title": "X",
                                "responsibilities": "Y"}, timeout=15)
        assert r.status_code == 403

    def test_list_visibility(self, admin_token, pro_token, member_token):
        # Admin sees
        r = requests.get(f"{BASE_URL}/api/job-sheets?q={TEST_TAG}", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] >= 1
        # Pro sees (PRO_BUREAU)
        r = requests.get(f"{BASE_URL}/api/job-sheets?q={TEST_TAG}", headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] >= 1
        # Member does not see PRO_BUREAU (only ALL)
        r = requests.get(f"{BASE_URL}/api/job-sheets?q={TEST_TAG}", headers=auth_headers(member_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_update_job_sheet(self, admin_token):
        assert TestJobSheets.sheet_id
        r = requests.put(f"{BASE_URL}/api/job-sheets/{TestJobSheets.sheet_id}",
                         headers=auth_headers(admin_token),
                         json={"role_title": f"{TEST_TAG}_RoleV2", "visibility": "ALL"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["visibility"] == "ALL"


# ============================================================ GUIDES
class TestGuides:
    admin_guide_id = None
    pro_guide_id = None

    def test_bureau_creates_published(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/guides", headers=auth_headers(admin_token),
                          json={"title": f"{TEST_TAG}_BureauGuide", "module": "STOCKS",
                                "role_scopes": ["BUREAU"],
                                "content": "Contenu bureau minimum 10", "visibility": "ALL"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "PUBLISHED"
        TestGuides.admin_guide_id = d["guide_id"]

    def test_pro_creates_pending(self, pro_token):
        r = requests.post(f"{BASE_URL}/api/guides", headers=auth_headers(pro_token),
                          json={"title": f"{TEST_TAG}_ProGuide", "module": "ACTIVITES",
                                "role_scopes": ["PROFESSIONNEL"],
                                "content": "Contenu pro minimum 10", "visibility": "PRO_BUREAU"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "PENDING"
        TestGuides.pro_guide_id = d["guide_id"]

    def test_member_does_not_see_pending(self, member_token):
        r = requests.get(f"{BASE_URL}/api/guides?q={TEST_TAG}_ProGuide",
                         headers=auth_headers(member_token), timeout=15)
        assert r.status_code == 200
        assert not any(g.get("status") == "PENDING" for g in r.json()["items"])

    def test_review_refuse_without_comment(self, admin_token):
        assert TestGuides.pro_guide_id
        r = requests.post(f"{BASE_URL}/api/guides/{TestGuides.pro_guide_id}/review",
                          headers=auth_headers(admin_token),
                          json={"decision": "REFUSE"}, timeout=15)
        assert r.status_code == 400

    def test_review_publish(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/guides/{TestGuides.pro_guide_id}/review",
                          headers=auth_headers(admin_token),
                          json={"decision": "PUBLISH", "visibility": "ALL"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "PUBLISHED"

    def test_guides_filter_and_demo(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/guides?q=DEMO", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        # Demo guides expected
        items = r.json()["items"]
        assert any("[DEMO]" in g.get("title", "") for g in items), f"No [DEMO] guides: {[g.get('title') for g in items]}"
        # Filter by module
        r = requests.get(f"{BASE_URL}/api/guides?module=STOCKS", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert all(g["module"] == "STOCKS" for g in r.json()["items"])

    def test_delete_guide(self, admin_token):
        r = requests.delete(f"{BASE_URL}/api/guides/{TestGuides.admin_guide_id}",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        r = requests.delete(f"{BASE_URL}/api/guides/{TestGuides.pro_guide_id}",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200


# ============================================================ HELP CENTER
class TestHelpCenter:
    def test_help_center_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/help/center", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["guides", "job_sheets", "by_module", "resources", "counts"]:
            assert k in d
        assert d["is_manager"] is True

    def test_help_center_pro(self, pro_token):
        r = requests.get(f"{BASE_URL}/api/help/center", headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 200

    def test_help_center_member(self, member_token):
        r = requests.get(f"{BASE_URL}/api/help/center", headers=auth_headers(member_token), timeout=15)
        assert r.status_code == 200
        # Member should only see ALL-visibility guides
        for g in r.json()["guides"]:
            assert g["visibility"] == "ALL", f"Member should not see guide with visibility={g['visibility']}"


# ============================================================ PRO REVIEWS
class TestProReviews:
    review_id = None

    def test_create_review_bureau(self, admin_token, pro_user):
        r = requests.post(f"{BASE_URL}/api/professionals/{pro_user['user_id']}/reviews",
                          headers=auth_headers(admin_token),
                          json={"professional_id": pro_user["user_id"],
                                "observations": f"{TEST_TAG} bon travail",
                                "strengths": "sérieux",
                                "context": "session terrain"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["author_id"]
        assert d["created_at"]
        TestProReviews.review_id = d["review_id"]

    def test_pro_cannot_read_own_reviews(self, pro_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/professionals/{pro_user['user_id']}/reviews",
                         headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 403, f"Pro should not see own reviews: {r.status_code}"

    def test_member_cannot_read(self, member_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/professionals/{pro_user['user_id']}/reviews",
                         headers=auth_headers(member_token), timeout=15)
        assert r.status_code == 403

    def test_admin_lists_reviews(self, admin_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/professionals/{pro_user['user_id']}/reviews",
                         headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_delete_review(self, admin_token):
        r = requests.delete(f"{BASE_URL}/api/professionals/reviews/{TestProReviews.review_id}",
                            headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200


# ============================================================ ANNUAL RECAP
class TestAnnualRecap:
    def test_annual_recap_bureau(self, admin_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/professionals/{pro_user['user_id']}/annual-recap?year=2026",
                         headers=auth_headers(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["activities", "events", "volunteering", "projects", "sessions",
                  "reservations", "tasks_done", "totals"]:
            assert k in d, f"missing {k}"
        for tk in ["activities", "events", "volunteering", "projects",
                   "sessions", "reservations", "tasks_done"]:
            assert tk in d["totals"]

    def test_annual_recap_pro_forbidden(self, pro_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/professionals/{pro_user['user_id']}/annual-recap?year=2026",
                         headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 403

    def test_export_annual_excel(self, admin_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/exports/pro-annual/{pro_user['user_id']}?year=2026",
                         headers=auth_headers(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "xlsx" in ct or "octet-stream" in ct, f"Wrong content-type: {ct}"
        assert len(r.content) > 1000, "Empty xlsx"

    def test_export_annual_pro_forbidden(self, pro_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/exports/pro-annual/{pro_user['user_id']}?year=2026",
                         headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 403
