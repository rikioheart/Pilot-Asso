"""Import CSV des membres existants : analyse, mapping, doublons, exécution."""
import csv
import io
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

import rbac
from deps import db, iso, now_utc, new_id, hash_password, require_admin, log_action

router = APIRouter(prefix="/api")

TARGET_FIELDS = {
    "last_name": ["nom", "lastname", "last_name", "nom de famille"],
    "first_name": ["prenom", "prénom", "firstname", "first_name"],
    "email": ["email", "e-mail", "mail", "courriel"],
    "role": ["role", "rôle", "type", "type de membre"],
    "category": ["categorie", "catégorie", "category", "activite", "activité"],
    "membership_date": ["date adhesion", "date adhésion", "date d'adhesion", "membership_date", "adhesion"],
    "dog": ["chien", "dog", "nom du chien"],
    "activities_count": ["nombre activites", "nombre activités", "activites", "activités", "activities"],
    "loyalty_points": ["points fidelite", "points fidélité", "points", "loyalty_points", "fidelite"],
    "phone": ["telephone", "téléphone", "phone", "tel", "portable"],
    "city": ["ville", "city", "commune"],
    "department": ["departement", "département", "department", "dept", "cp"],
}

FIELD_LABELS = {
    "last_name": "Nom", "first_name": "Prénom", "email": "Email", "role": "Rôle", "category": "Catégorie",
    "membership_date": "Date adhésion", "dog": "Chien", "activities_count": "Nombre activités",
    "loyalty_points": "Points fidélité", "phone": "Téléphone", "city": "Ville", "department": "Département",
}


def _norm(value: str) -> str:
    return (value or "").strip().lower().replace("_", " ").replace("-", " ")


def suggest(column: str) -> Optional[str]:
    c = _norm(column)
    for field, aliases in TARGET_FIELDS.items():
        if c in [_norm(a) for a in aliases]:
            return field
    for field, aliases in TARGET_FIELDS.items():
        if any(_norm(a) in c for a in aliases):
            return field
    return None


def parse_csv(raw: bytes):
    text = raw.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]
    return [c.strip() for c in (reader.fieldnames or [])], rows, delimiter


def normalize_role(value: str) -> str:
    v = _norm(value)
    if "pro" in v:
        return "PROFESSIONNEL"
    return "PARTICULIER"


@router.post("/imports/analyze")
async def analyze(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Merci de fournir un fichier .csv")
    columns, rows, delimiter = parse_csv(await file.read())
    if not columns:
        raise HTTPException(status_code=400, detail="Aucune colonne détectée dans le fichier")
    mapping = {c: suggest(c) for c in columns}
    email_col = next((c for c, f in mapping.items() if f == "email"), None)
    emails = [r.get(email_col, "").lower() for r in rows if email_col and r.get(email_col)]
    existing = set()
    if emails:
        async for u in db.users.find({"email": {"$in": emails}}, {"_id": 0, "email": 1}):
            existing.add(u["email"])
    duplicates_in_file = sorted({e for e in emails if emails.count(e) > 1})
    return {
        "columns": columns, "delimiter": delimiter, "row_count": len(rows),
        "suggested_mapping": mapping, "target_fields": FIELD_LABELS,
        "preview": rows[:8],
        "existing_emails": sorted(existing),
        "duplicates_in_file": duplicates_in_file,
        "missing_email_rows": len([r for r in rows if not email_col or not r.get(email_col)]),
    }


@router.post("/imports/execute")
async def execute(file: UploadFile = File(...), mapping: str = Form(...),
                  update_existing: bool = Form(False), admin: dict = Depends(require_admin)):
    import json
    try:
        column_map = json.loads(mapping)
    except Exception:
        raise HTTPException(status_code=400, detail="Correspondance de colonnes invalide")
    if "email" not in column_map.values():
        raise HTTPException(status_code=400, detail="La colonne Email est obligatoire pour l'import")
    columns, rows, _ = parse_csv(await file.read())
    created, updated, skipped, conflicts = 0, 0, 0, []
    import_id = new_id("imp")

    for index, row in enumerate(rows, start=2):
        data = {}
        for column, field in column_map.items():
            if field and column in row:
                data[field] = row[column].strip()
        email = (data.get("email") or "").lower()
        if not email or "@" not in email:
            conflicts.append({"line": index, "email": email or "(vide)", "reason": "E-mail manquant ou invalide"})
            skipped += 1
            continue
        existing = await db.users.find_one({"email": email})
        if existing and not update_existing:
            conflicts.append({"line": index, "email": email, "reason": "Compte déjà existant — non écrasé"})
            skipped += 1
            continue
        role = normalize_role(data.get("role", ""))
        profile_updates = {
            "first_name": data.get("first_name") or "",
            "last_name": data.get("last_name") or "",
            "phone": data.get("phone") or None,
            "city": data.get("city") or None,
            "department": data.get("department") or None,
            "imported": True, "import_id": import_id, "updated_at": iso(now_utc()),
        }
        profile_updates["display_name"] = f"{profile_updates['first_name']} {profile_updates['last_name']}".strip() or email
        if data.get("membership_date"):
            profile_updates["membership_date"] = data["membership_date"]
        if data.get("category"):
            profile_updates["professional_category_raw"] = data["category"]
        if data.get("loyalty_points"):
            profile_updates["imported_loyalty_points"] = data["loyalty_points"]
        if data.get("activities_count"):
            profile_updates["imported_activities_count"] = data["activities_count"]

        if existing:
            await db.profiles.update_one({"user_id": existing["user_id"]},
                                        {"$set": {k: v for k, v in profile_updates.items() if v not in (None, "")}})
            updated += 1
            user_id = existing["user_id"]
        else:
            user_id = new_id("user")
            await db.users.insert_one({
                "user_id": user_id, "email": email, "role": role,
                "access_level": rbac.DEFAULT_LEVEL[role],
                "permission_overrides": {"granted": [], "revoked": []},
                "status": "ACTIVE", "is_active": True, "is_demo": False, "imported": True,
                "import_id": import_id, "auth_provider": "password",
                "password_hash": hash_password(secrets.token_urlsafe(24)),
                "created_at": iso(now_utc()), "updated_at": iso(now_utc()), "last_login": None,
            })
            await db.profiles.insert_one({
                "profile_id": new_id("prf"), "user_id": user_id, "avatar": None,
                "membership_type": role, "membership_status": "ACTIVE",
                "membership_date": data.get("membership_date") or iso(now_utc()),
                "bio": None, "visibility": "MEMBERS", "involvement_level": rbac.DEFAULT_LEVEL[role],
                "function_badges": [], "preferences": {}, "created_at": iso(now_utc()), **profile_updates,
            })
            created += 1
        if data.get("dog"):
            already = await db.dogs.find_one({"owner_id": user_id, "name": data["dog"]})
            if not already:
                await db.dogs.insert_one({
                    "dog_id": new_id("dog"), "owner_id": user_id, "name": data["dog"], "breed": None,
                    "sex": None, "birth_date": None, "photo": None, "description": None, "character": None,
                    "needs": None, "useful_information": None, "visibility": "MEMBERS", "imported": True,
                    "created_at": iso(now_utc()), "updated_at": iso(now_utc())})

    await db.import_runs.insert_one({
        "import_id": import_id, "user_id": admin["user_id"], "filename": file.filename,
        "created": created, "updated": updated, "skipped": skipped, "conflicts": conflicts,
        "row_count": len(rows), "created_at": iso(now_utc())})
    await log_action(admin, "IMPORT", "imports", import_id,
                    new_value={"created": created, "updated": updated, "skipped": skipped})
    return {"import_id": import_id, "created": created, "updated": updated,
            "skipped": skipped, "conflicts": conflicts, "row_count": len(rows)}


@router.get("/imports/history")
async def history(admin: dict = Depends(require_admin)):
    items = await db.import_runs.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return {"items": items}
