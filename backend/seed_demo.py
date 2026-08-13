"""Données de démonstration clairement marquées DEMO (idempotent par module)."""
import uuid
from datetime import datetime, timezone, timedelta

DEMO_PASSWORD = "Demo2026!"


def _id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


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

DEMO_PRO_DETAILS = {
    "pro1.demo@lavoixduchien.fr": {
        "company_name": "Éduc'Canin Gâtinais [DEMO]", "professional_category": "EDUCATEUR_CANIN",
        "secondary_categories": ["COMPORTEMENTALISTE"],
        "description": "Éducation canine positive et accompagnement des familles (fiche de démonstration).",
        "specialties": ["Éducation positive", "Chiots", "Marche en laisse"],
        "services": ["Cours individuels", "Balades éducatives", "Ateliers collectifs"],
        "service_area": "Montargis et 30 km alentour", "departments": ["45", "77"],
        "website": "https://example.org/educ-canin-demo",
        "social_links": {"instagram": "https://instagram.com/demo"},
        "phone": "06 00 00 00 01", "email": "pro1.demo@lavoixduchien.fr",
        "member_advantages": "-10 % sur le premier cours pour les adhérents",
        "partnership_status": "ACTIVE", "partnership_percentage": 20.0,
        "contract_status": "SIGNED", "contract_reference": "DEMO-2026-001",
        "public_visibility": "MEMBERS",
    },
    "pro2.demo@lavoixduchien.fr": {
        "company_name": "Bien-Être Canin Sens [DEMO]", "professional_category": "OSTEOPATHE",
        "secondary_categories": ["MASSEUR_CANIN"],
        "description": "Ostéopathie et massage canin, prévention des troubles locomoteurs (démonstration).",
        "specialties": ["Ostéopathie", "Chiens sportifs", "Chiens âgés"],
        "services": ["Séances à domicile", "Ateliers prévention"],
        "service_area": "Yonne et nord Loiret", "departments": ["89", "45"],
        "website": "https://example.org/bien-etre-demo", "social_links": {},
        "phone": "06 00 00 00 02", "email": "pro2.demo@lavoixduchien.fr",
        "member_advantages": "Bilan postural offert aux adhérents",
        "partnership_status": "ACTIVE", "partnership_percentage": 25.0,
        "contract_status": "SIGNED", "contract_reference": "DEMO-2026-002",
        "public_visibility": "MEMBERS",
    },
}


async def seed_users(db, create_user_and_profile):
    created = {}
    for email, role, first, last, level, status, city, dept in DEMO_USERS:
        existing = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
        if existing:
            created[email] = existing["user_id"]
            continue
        user = await create_user_and_profile(
            email, role, first, last, password=DEMO_PASSWORD, status=status,
            access_level=level, is_demo=True,
            extra_profile={"city": city, "department": dept, "is_demo": True,
                           "bio": "Profil de démonstration (DEMO) — ne correspond à aucun membre réel."})
        created[email] = user["user_id"]
    return created


async def seed_dogs(db, owner_id):
    if not owner_id or await db.dogs.count_documents({"is_demo": True}) > 0:
        return
    for name, breed, sex, character in DEMO_DOGS:
        await db.dogs.insert_one({
            "dog_id": _id("dog"), "owner_id": owner_id, "name": f"{name} [DEMO]", "breed": breed, "sex": sex,
            "birth_date": None, "photo": None, "description": "Chien de démonstration.", "character": character,
            "needs": "Balades quotidiennes", "useful_information": None, "visibility": "MEMBERS",
            "is_demo": True, "created_at": _iso(_now()), "updated_at": _iso(_now())})


async def seed_pro_details(db, users):
    for email, details in DEMO_PRO_DETAILS.items():
        user_id = users.get(email)
        if not user_id or await db.professional_details.find_one({"user_id": user_id}):
            continue
        profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0, "profile_id": 1})
        await db.professional_details.insert_one({
            "details_id": _id("pro"), "user_id": user_id, "profile_id": (profile or {}).get("profile_id"),
            "logo": None, "promo_codes": [], "documents": [], "contract_url": None,
            "is_demo": True, "created_at": _iso(_now()), "updated_at": _iso(_now()), **details})


PROJECTS = [
    {
        "title": "Journée à thème « Bien vivre avec son chien » [DEMO]",
        "description": "Journée d'ateliers et de balades encadrées par les professionnels du réseau.",
        "category": "EVENEMENT", "status": "IN_PROGRESS", "priority": "HAUTE", "days": 30,
        "visibility": "MEMBERS",
        "tasks": [
            ("Trouver les professionnels intervenants", "COMPLETED", None, False, 5),
            ("Réserver la salle municipale", "PENDING_VALIDATION", "pro", False, 8),
            ("Préparer l'affiche et le post Instagram", "IN_PROGRESS", "pro", False, 12),
            ("Distribuer les flyers dans les commerces", "TODO", None, True, 15),
            ("Accueillir les participants le jour J", "TODO", None, True, 30),
        ],
    },
    {
        "title": "Prévention en école primaire — Nargis [DEMO]",
        "description": "Intervention pédagogique auprès des enfants : comprendre et respecter le chien.",
        "category": "PEDAGOGIE", "status": "PLANNED", "priority": "NORMALE", "days": 60,
        "visibility": "MEMBERS",
        "tasks": [
            ("Contacter la mairie et l'école", "IN_PROGRESS", "pro2", False, 10),
            ("Concevoir le support pédagogique", "TODO", "pro2", False, 25),
            ("Tester l'atelier avec un petit groupe", "TODO", None, False, 40),
            ("Rédiger le bilan de l'intervention", "TODO", None, True, 65),
        ],
    },
    {
        "title": "Article de blog : la marche en laisse sans tension [DEMO]",
        "description": "Contenu pédagogique pour le blog de l'association.",
        "category": "BLOG", "status": "IN_PROGRESS", "priority": "NORMALE", "days": 20,
        "visibility": "PROFESSIONALS",
        "tasks": [
            ("Recherche documentaire", "COMPLETED", "pro", False, -2),
            ("Rédaction du premier jet", "IN_PROGRESS", "pro", False, 6),
            ("Relecture par un second professionnel", "TODO", None, False, 12),
            ("Créer le visuel de couverture", "TODO", None, True, 14),
        ],
    },
    {
        "title": "Recherche d'un terrain d'activités [DEMO]",
        "description": "Identifier un terrain clôturé pour les activités collectives et les futurs équipements.",
        "category": "TERRAIN", "status": "TO_REVIEW", "priority": "HAUTE", "days": 120,
        "visibility": "BUREAU",
        "tasks": [
            ("Lister les communes à contacter", "COMPLETED", None, False, -5),
            ("Prendre rendez-vous en mairie", "TODO", None, False, 20),
            ("Visiter les terrains proposés", "TODO", None, False, 45),
        ],
    },
]


async def seed_projects(db, users, notify):
    if await db.projects.count_documents({"is_demo": True}) > 0:
        return
    admin = await db.users.find_one({"role": "ADMIN_BUREAU"}, {"_id": 0, "user_id": 1})
    if not admin:
        return
    admin_id = admin["user_id"]
    pro = users.get("pro1.demo@lavoixduchien.fr")
    pro2 = users.get("pro2.demo@lavoixduchien.fr")
    benevole = users.get("benevole.demo@lavoixduchien.fr")
    assignees = {"pro": pro, "pro2": pro2, "benevole": benevole}

    for spec in PROJECTS:
        project_id = _id("prj")
        total = len(spec["tasks"])
        done = len([t for t in spec["tasks"] if t[1] == "COMPLETED"])
        await db.projects.insert_one({
            "project_id": project_id, "title": spec["title"],
            "slug": spec["title"].lower().replace(" ", "-")[:60], "description": spec["description"],
            "category": spec["category"], "status": spec["status"], "priority": spec["priority"],
            "start_date": _iso(_now()), "deadline": _iso(_now() + timedelta(days=spec["days"])),
            "completion_percentage": int(round(done * 100 / total)) if total else 0,
            "owner_id": pro2 if spec["category"] == "PEDAGOGIE" else admin_id,
            "visibility": spec["visibility"], "parent_project_id": None, "mindmap_node_id": None,
            "budget_reference": None, "linked_partner_ids": [], "linked_event_ids": [],
            "linked_activity_ids": [], "needs_help": False, "template": None, "is_demo": True,
            "created_by": admin_id, "created_at": _iso(_now()), "updated_at": _iso(_now()), "archived_at": None,
        })
        owner_id = pro2 if spec["category"] == "PEDAGOGIE" else admin_id
        for member_id, role in [(owner_id, "OWNER"), (pro, "CONTRIBUTOR"), (benevole, "VOLUNTEER")]:
            if member_id:
                await db.project_teams.insert_one({
                    "team_id": _id("tm"), "project_id": project_id, "member_id": member_id,
                    "role_in_project": role, "participation_level": "REGULIER",
                    "joined_at": _iso(_now()), "status": "ACTIVE", "is_demo": True})
        for title, status, who, volunteer, days in spec["tasks"]:
            assigned = assignees.get(who)
            task_id = _id("tsk")
            doc = {
                "task_id": task_id, "project_id": project_id, "parent_task_id": None, "title": title,
                "description": None, "status": status, "priority": "NORMALE",
                "assigned_user_id": assigned, "assigned_team_id": None, "created_by": admin_id,
                "deadline": _iso(_now() + timedelta(days=days)), "completed_at": None,
                "submitted_at": None, "submitted_by": None, "validated_at": None, "validated_by": None,
                "rejection_reason": None, "proof": None, "attachments": [], "comments": [],
                "visibility": "PROJECT_TEAM", "is_volunteer_task": volunteer, "needs_help": False,
                "blocked_by_task_id": None, "is_demo": True,
                "created_at": _iso(_now()), "updated_at": _iso(_now()),
            }
            if status == "COMPLETED":
                doc.update({"completed_at": _iso(_now() - timedelta(days=2)),
                            "validated_at": _iso(_now() - timedelta(days=2)), "validated_by": admin_id,
                            "submitted_by": assigned, "submitted_at": _iso(_now() - timedelta(days=3)),
                            "proof": "Compte rendu envoyé au Bureau (DEMO)"})
            if status == "PENDING_VALIDATION":
                doc.update({"submitted_at": _iso(_now() - timedelta(hours=6)), "submitted_by": assigned,
                            "proof": "Confirmation écrite de la mairie (lien externe DEMO)",
                            "comments": [{"comment_id": _id("cmt"), "user_id": assigned,
                                          "user_name": "Camille Dubreuil [DEMO]",
                                          "text": "Salle confirmée pour le samedi, capacité 40 personnes.",
                                          "created_at": _iso(_now() - timedelta(hours=6))}]})
            await db.tasks.insert_one(doc)
            await db.task_history.insert_one({
                "history_id": _id("th"), "task_id": task_id, "user_id": admin_id,
                "user_name": "Bureau La Voix du Chien", "action": "CREATE", "old_value": None,
                "new_value": {"title": title}, "comment": "Création (DEMO)", "timestamp": _iso(_now())})

    if benevole:
        await db.help_requests.insert_one({
            "help_id": _id("help"), "type": "NEEDS_HELP", "user_id": benevole,
            "user_name": "Marc Vasseur [DEMO]",
            "message": "Je veux bien distribuer les flyers mais je ne connais pas les commerces à cibler.",
            "skills": ["logistique", "communication"], "context_type": "project", "context_id": None,
            "status": "OPEN", "response": None, "handled_by": None, "is_demo": True,
            "created_at": _iso(_now()), "resolved_at": None})

    async for admin_doc in db.users.find({"role": "ADMIN_BUREAU"}, {"_id": 0, "user_id": 1}):
        await notify(admin_doc["user_id"], type="TASK_TO_VALIDATE", title="Tâche à valider [DEMO]",
                     message="Camille Dubreuil [DEMO] a terminé « Réserver la salle municipale ».",
                     level="ACTION", resource_type="task", resource_id=None, link="/admin/validation")
        await notify(admin_doc["user_id"], type="NEEDS_HELP", title="Un membre a besoin d'aide [DEMO]",
                     message="Marc Vasseur [DEMO] : je ne sais pas quels commerces cibler.",
                     level="ACTION", resource_type="help_request", resource_id=None, link="/admin/help")


async def seed_demo(db, create_user_and_profile, notify):
    users = await seed_users(db, create_user_and_profile)
    await seed_dogs(db, users.get("membre1.demo@lavoixduchien.fr"))
    await seed_pro_details(db, users)
    await seed_projects(db, users, notify)
    if await db.notifications.count_documents({"type": "SYSTEM"}) == 0:
        async for admin in db.users.find({"role": "ADMIN_BUREAU"}, {"_id": 0, "user_id": 1}):
            await notify(admin["user_id"], type="SYSTEM", title="Bienvenue sur votre cockpit",
                         message="Phase 1 et 2 installées : membres, projets, tâches, validations, annuaire.",
                         level="INFO", link="/admin/dashboard")
