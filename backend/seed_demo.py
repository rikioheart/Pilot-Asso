"""Données de démonstration clairement marquées DEMO."""
import uuid
from datetime import datetime, timezone, timedelta

DEMO_PASSWORD = "Demo2026!"

DEMO_USERS = [
    ("pro1.demo@lavoixduchien.fr", "PROFESSIONNEL", "Camille", "Dubreuil [DEMO]", "PRO_STANDARD", "ACTIVE", "Montargis", "45"),
    ("pro2.demo@lavoixduchien.fr", "PROFESSIONNEL", "Julien", "Marchais [DEMO]", "PRO_COORDINATEUR", "ACTIVE", "Sens", "89"),
    ("membre1.demo@lavoixduchien.fr", "PARTICULIER", "Sophie", "Lenoir [DEMO]", "PARTICULIER_STANDARD", "ACTIVE", "Nargis", "45"),
    ("benevole.demo@lavoixduchien.fr", "PARTICULIER", "Marc", "Vasseur [DEMO]", "BENEVOLE_VALIDE", "ACTIVE", "Fontainebleau", "77"),
    ("attente.demo@lavoixduchien.fr", "PROFESSIONNEL", "Léa", "Bonnet [DEMO]", "PRO_STANDARD", "PENDING", "Évry", "91"),
]

DEMO_DOGS = [
    ("Nikko", "Berger allemand", "M", "Sociable, très attaché à sa famille."),
    ("Java", "Croisée border collie", "F", "Énergique, adore les jeux de flair."),
]


async def seed_demo(db, create_user_and_profile, notify):
    if await db.users.count_documents({"is_demo": True}) > 0:
        return
    created = {}
    for email, role, first, last, level, status, city, dept in DEMO_USERS:
        if await db.users.find_one({"email": email}):
            continue
        user = await create_user_and_profile(
            email, role, first, last, password=DEMO_PASSWORD, status=status,
            access_level=level, is_demo=True,
            extra_profile={"city": city, "department": dept, "is_demo": True,
                           "bio": "Profil de démonstration (DEMO) — ne correspond à aucun membre réel."},
        )
        created[email] = user["user_id"]

    owner = created.get("membre1.demo@lavoixduchien.fr")
    if owner:
        now = datetime.now(timezone.utc).isoformat()
        for name, breed, sex, character in DEMO_DOGS:
            await db.dogs.insert_one({
                "dog_id": f"dog_{uuid.uuid4().hex[:12]}", "owner_id": owner, "name": f"{name} [DEMO]",
                "breed": breed, "sex": sex, "birth_date": None, "photo": None,
                "description": "Chien de démonstration.", "character": character,
                "needs": "Balades quotidiennes", "useful_information": None,
                "visibility": "MEMBERS", "is_demo": True, "created_at": now, "updated_at": now,
            })

    async for admin in db.users.find({"role": "ADMIN_BUREAU"}):
        await notify(admin["user_id"], type="NEW_MEMBERSHIP", title="Nouvelle demande d'adhésion [DEMO]",
                     message="Léa Bonnet [DEMO] (professionnelle) attend une validation du Bureau.",
                     level="ACTION", resource_type="user", resource_id=created.get("attente.demo@lavoixduchien.fr"),
                     link="/admin/members")
        await notify(admin["user_id"], type="SYSTEM", title="Bienvenue sur votre cockpit",
                     message="Phase 1 installée : comptes, rôles, permissions, notifications et journal d'audit.",
                     level="INFO", link="/admin/dashboard")
