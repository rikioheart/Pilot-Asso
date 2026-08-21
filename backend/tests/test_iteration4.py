"""Tests itération 4 : profils/rôles/accessibilité + suivi des chiens (confidentialité)."""
import os
import time
import requests

from tests.conftest import BASE_URL, auth_headers, ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PWD, PRO_STD, MEMBER

CRON_SECRET = "vdc_cron_9f4b2e7a1c6d8035be4712af95d3c60e"

# helpers ------------------------------------------------------
def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"], r.json()["user"]


# ---- Cron regression ----------------------------------------
def test_cron_weekly_summary_unauthorized():
    r = requests.post(f"{BASE_URL}/api/cron/weekly-summary", json={}, timeout=15)
    assert r.status_code == 401, r.text


def test_cron_weekly_summary_authorized_and_idempotent():
    hdr = {"Authorization": f"Bearer {CRON_SECRET}", "Content-Type": "application/json"}
    run_id = f"test_run_{int(time.time())}"
    r1 = requests.post(f"{BASE_URL}/api/cron/weekly-summary", headers=hdr,
                       json={"run_id": run_id}, timeout=20)
    assert r1.status_code == 200, r1.text
    assert r1.json().get("ok") is True
    # replay with same run_id must be duplicate
    r2 = requests.post(f"{BASE_URL}/api/cron/weekly-summary", headers=hdr,
                       json={"run_id": run_id}, timeout=20)
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True


# ---- RBAC particulier no more documents.view / mindmap.view --
def test_particulier_no_documents_no_mindmap(member_token):
    r = requests.get(f"{BASE_URL}/api/documents", headers=auth_headers(member_token), timeout=15)
    assert r.status_code == 403, r.text
    r2 = requests.get(f"{BASE_URL}/api/mindmap", headers=auth_headers(member_token), timeout=15)
    assert r2.status_code == 403, r2.text


# ---- Members catégorie + promotion --------------------------
def test_member_category_requires_admin(pro_token, member_token, member_user):
    # pro cannot
    r = requests.put(f"{BASE_URL}/api/members/{member_user['user_id']}/category",
                     headers=auth_headers(pro_token), json={"member_category": "PARTICULIER"}, timeout=15)
    assert r.status_code == 403
    # member cannot
    r = requests.put(f"{BASE_URL}/api/members/{member_user['user_id']}/category",
                     headers=auth_headers(member_token), json={"member_category": "PARTICULIER"}, timeout=15)
    assert r.status_code == 403


def test_admin_promotes_member_to_pro_via_category(admin_token):
    # create a fresh member for this test
    email = f"TEST_promo_{int(time.time())}@lavoixduchien.fr"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "TestPromo2026!",
                            "first_name": "Promo", "last_name": "Test",
                            "role": "PARTICULIER"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["user"]["user_id"]
    # activate the user
    requests.put(f"{BASE_URL}/api/members/{uid}",
                 headers=auth_headers(admin_token),
                 json={"status": "ACTIVE"}, timeout=15)
    # promote to PROFESSIONNEL category
    r = requests.put(f"{BASE_URL}/api/members/{uid}/category",
                     headers=auth_headers(admin_token),
                     json={"member_category": "PROFESSIONNEL"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "PROFESSIONNEL"
    assert body["appears_in_directory"] is True


# ---- Accessibility -----------------------------------------
def test_accessibility_invalid_value_french(member_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/accessibility",
                     headers=auth_headers(member_token), json={"font": "COMIC"}, timeout=15)
    assert r.status_code == 400
    assert "invalide" in r.json().get("detail", "").lower()


def test_accessibility_valid_persisted(member_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/accessibility",
                     headers=auth_headers(member_token),
                     json={"font": "DYSLEXIA", "contrast": "HIGH",
                           "text_size": "LARGE", "focus_mode": True}, timeout=15)
    assert r.status_code == 200
    acc = r.json()["accessibility"]
    assert acc["font"] == "DYSLEXIA"
    assert acc["contrast"] == "HIGH"
    # verify persisted via /me/space
    r2 = requests.get(f"{BASE_URL}/api/me/space", headers=auth_headers(member_token), timeout=15)
    assert r2.status_code == 200
    assert r2.json()["accessibility"]["font"] == "DYSLEXIA"


def test_preferences_invalid_module_refused(member_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/preferences",
                     headers=auth_headers(member_token),
                     json={"hidden_modules": ["foobar"]}, timeout=15)
    assert r.status_code == 400


# ---- Pro-space ---------------------------------------------
def test_pro_space_particulier_refused(member_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/pro-space",
                     headers=auth_headers(member_token),
                     json={"company_name": "TEST_bad"}, timeout=15)
    assert r.status_code == 403


def test_pro_space_ok(pro_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/pro-space",
                     headers=auth_headers(pro_token),
                     json={"company_name": "TEST_Cabinet", "siret": "12345678900011",
                           "specialties": ["Éducation", "Comportement"],
                           "website_url": "https://example.com"}, timeout=15)
    assert r.status_code == 200


def test_pro_space_bad_website(pro_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/pro-space",
                     headers=auth_headers(pro_token),
                     json={"website_url": "example.com"}, timeout=15)
    assert r.status_code == 400


# ---- Function description ----------------------------------
def test_function_description_pro_pending(pro_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/function-description",
                     headers=auth_headers(pro_token),
                     json={"function_description": "Je m'occupe de la médiation animale."}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "PENDING"


def test_function_description_admin_approved(admin_token):
    r = requests.put(f"{BASE_URL}/api/profiles/me/function-description",
                     headers=auth_headers(admin_token),
                     json={"function_description": "Je pilote l'association."}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "APPROVED"


# ---- Animation review --------------------------------------
def test_animation_review_pro_forbidden(pro_token):
    r = requests.get(f"{BASE_URL}/api/animation-review",
                     headers=auth_headers(pro_token), timeout=15)
    assert r.status_code == 403


def test_animation_review_admin_ok(admin_token):
    r = requests.get(f"{BASE_URL}/api/animation-review",
                     headers=auth_headers(admin_token), timeout=15)
    assert r.status_code == 200
    data = r.json()
    for k in ("inactive", "incomplete", "guide_not_seen", "totals"):
        assert k in data


def test_nudge_too_short(admin_token, member_user):
    r = requests.post(f"{BASE_URL}/api/members/{member_user['user_id']}/nudge",
                      headers=auth_headers(admin_token), json={"message": "salut"}, timeout=15)
    assert r.status_code == 400


def test_nudge_ok(admin_token, member_user):
    r = requests.post(f"{BASE_URL}/api/members/{member_user['user_id']}/nudge",
                      headers=auth_headers(admin_token),
                      json={"message": "TEST_ bravo pour votre implication récente !"}, timeout=15)
    assert r.status_code == 200


# ---- Join requests -----------------------------------------
def test_join_request_help_offer_and_duplicate(member_token):
    payload = {"kind": "HELP_OFFER", "message": "TEST_ Je suis dispo pour donner un coup de main."}
    r = requests.post(f"{BASE_URL}/api/join-requests",
                      headers=auth_headers(member_token), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    # duplicate on same target (None) refused
    r2 = requests.post(f"{BASE_URL}/api/join-requests",
                       headers=auth_headers(member_token), json=payload, timeout=15)
    assert r2.status_code == 400


# ---- /me/space --------------------------------------------
def test_me_space_returns_keys(member_token):
    r = requests.get(f"{BASE_URL}/api/me/space", headers=auth_headers(member_token), timeout=15)
    assert r.status_code == 200
    keys = {"activities", "events", "formations", "join_requests",
            "advantages_claimed", "preferences", "accessibility"}
    assert keys.issubset(r.json().keys())


# =============================================================
# DOGS
# =============================================================
def _create_dog_as_owner(token, name="TEST_Dog"):
    r = requests.post(f"{BASE_URL}/api/dogs", headers=auth_headers(token),
                      json={"name": name}, timeout=15)
    return r


def test_member_creates_own_dog(member_token):
    r = _create_dog_as_owner(member_token, name=f"TEST_dog_{int(time.time())}")
    assert r.status_code == 200, r.text
    assert r.json()["name"].startswith("TEST_dog_")


def test_member_cannot_create_for_another(member_token, admin_user):
    r = requests.post(f"{BASE_URL}/api/dogs", headers=auth_headers(member_token),
                      json={"name": "TEST_forbidden", "owner_id": admin_user["user_id"]}, timeout=15)
    assert r.status_code == 403


def test_admin_can_create_for_another(admin_token, member_user):
    r = requests.post(f"{BASE_URL}/api/dogs", headers=auth_headers(admin_token),
                      json={"name": f"TEST_admincreate_{int(time.time())}",
                            "owner_id": member_user["user_id"]}, timeout=15)
    assert r.status_code == 200, r.text


def test_dogs_list_scoping(admin_token, pro_token, member_token):
    ra = requests.get(f"{BASE_URL}/api/dogs", headers=auth_headers(admin_token), timeout=15)
    rp = requests.get(f"{BASE_URL}/api/dogs", headers=auth_headers(pro_token), timeout=15)
    rm = requests.get(f"{BASE_URL}/api/dogs", headers=auth_headers(member_token), timeout=15)
    assert ra.status_code == 200 and rp.status_code == 200 and rm.status_code == 200
    admin_count = ra.json()["total"]
    # pro sees only assigned dogs (<= admin)
    assert rp.json()["total"] <= admin_count
    # member sees only own dogs
    for d in rm.json()["items"]:
        assert d.get("owner_name")  # display shown


def test_dogs_stats_requires_perm(admin_token, member_token):
    r = requests.get(f"{BASE_URL}/api/dogs-stats", headers=auth_headers(admin_token), timeout=15)
    assert r.status_code == 200
    for k in ("dogs_total", "dogs_followed", "by_intervention", "by_behavior"):
        assert k in r.json()
    r2 = requests.get(f"{BASE_URL}/api/dogs-stats", headers=auth_headers(member_token), timeout=15)
    assert r2.status_code == 403


# ---- referent + confidentiality (POINT CRITIQUE) ----------
def test_referent_and_confidentiality_flow(admin_token, pro_token, member_token,
                                           pro_user, member_user):
    # 1. Member creates own dog
    r = requests.post(f"{BASE_URL}/api/dogs", headers=auth_headers(member_token),
                      json={"name": f"TEST_confidog_{int(time.time())}",
                            "behavior_category": "REACTIVITE"}, timeout=15)
    assert r.status_code == 200
    dog_id = r.json()["dog_id"]

    # 2. Owner sets referent = pro
    r = requests.put(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(member_token),
                     json={"referent_pro_id": pro_user["user_id"]}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["referent_pro_id"] == pro_user["user_id"]

    # 2b. Refuse non-pro referent
    r = requests.put(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(admin_token),
                     json={"referent_pro_id": member_user["user_id"]}, timeout=15)
    assert r.status_code == 400

    # 3. Pro (team member) creates a case + step
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/cases",
                      headers=auth_headers(pro_token),
                      json={"problem": "TEST_ Réactivité en balade", "objectives": ["Marche calme"]},
                      timeout=15)
    assert r.status_code == 200, r.text
    case_id = r.json()["case_id"]

    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/cases/{case_id}/steps",
                      headers=auth_headers(pro_token),
                      json={"label": "Séance 1", "progress": 20, "visible_to_owner": True},
                      timeout=15)
    assert r.status_code == 200

    # 4. Owner cannot create case or step
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/cases",
                      headers=auth_headers(member_token),
                      json={"problem": "TEST_bad"}, timeout=15)
    assert r.status_code == 403

    # 5. Pro posts a PRIVATE report (visible_to_owner=false)
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/reports",
                      headers=auth_headers(pro_token),
                      json={"intervention_type": "COMPORTEMENT",
                            "observations": "TEST_ note privée entre pros", "visible_to_owner": False},
                      timeout=15)
    assert r.status_code == 200, r.text
    report_id = r.json()["report_id"]

    # 6. Owner GET /dogs/{id} → report NOT visible
    r = requests.get(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(member_token), timeout=15)
    assert r.status_code == 200
    assert all(rep["report_id"] != report_id for rep in r.json()["reports"]), \
        "Confidentialité KO : le compte-rendu privé est visible du propriétaire"

    # 7. Admin/pro see it
    r = requests.get(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(pro_token), timeout=15)
    assert any(rep["report_id"] == report_id for rep in r.json()["reports"])

    # 8. Toggle visibility
    r = requests.put(f"{BASE_URL}/api/dogs/{dog_id}/reports/{report_id}",
                     headers=auth_headers(pro_token), json={"visible_to_owner": True}, timeout=15)
    assert r.status_code == 200

    # 9. Now owner sees it
    r = requests.get(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(member_token), timeout=15)
    assert any(rep["report_id"] == report_id for rep in r.json()["reports"])

    # 10. Comment private → invisible from owner
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/reports/{report_id}/comments",
                     headers=auth_headers(pro_token),
                     json={"message": "TEST_ commentaire pro à pro", "visible_to_owner": False}, timeout=15)
    assert r.status_code == 200
    comment_id = r.json()["comment_id"]
    r = requests.get(f"{BASE_URL}/api/dogs/{dog_id}", headers=auth_headers(member_token), timeout=15)
    for rep in r.json()["reports"]:
        if rep["report_id"] == report_id:
            assert all(c["comment_id"] != comment_id for c in rep.get("comments", [])), \
                "Confidentialité KO : commentaire privé visible du propriétaire"

    # 11. Owner post owner-notes OK
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/owner-notes",
                      headers=auth_headers(member_token),
                      json={"message": "TEST_ note du propriétaire"}, timeout=15)
    assert r.status_code == 200

    # 12. Pro cannot post owner-notes
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/owner-notes",
                      headers=auth_headers(pro_token),
                      json={"message": "TEST_ interdit"}, timeout=15)
    assert r.status_code == 403

    # 13. Link with invalid activity
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/link",
                      headers=auth_headers(member_token),
                      json={"activity_id": "unknown_id_xyz"}, timeout=15)
    assert r.status_code == 404
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/link",
                      headers=auth_headers(member_token),
                      json={}, timeout=15)
    assert r.status_code == 400


def test_pro_not_intervening_cannot_access(admin_token, member_token, pro_token, member_user):
    # Use pro2 token (not the referent) — need a fresh dog owned by member with NO referent
    r = requests.post(f"{BASE_URL}/api/dogs", headers=auth_headers(member_token),
                      json={"name": f"TEST_isolated_{int(time.time())}"}, timeout=15)
    assert r.status_code == 200
    dog_id = r.json()["dog_id"]
    # pro (not intervening) tries to open case
    r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/cases",
                      headers=auth_headers(pro_token),
                      json={"problem": "TEST_ pas autorisé"}, timeout=15)
    assert r.status_code == 403
