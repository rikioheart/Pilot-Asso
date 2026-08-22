"""Données de démonstration — guides d'utilisation et fiches de poste (Prompt 6)."""
import asyncio
import os

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

GUIDES = [
    {"title": "Créer une activité pas à pas [DEMO]", "module": "ACTIVITES",
     "role_scopes": ["BUREAU", "PROFESSIONNEL"], "visibility": "PRO_BUREAU",
     "summary": "Publier une activité et la rendre éligible à la carte d'engagement.",
     "content": "1. Ouvrez « Activités » puis « Nouvelle activité ».\n"
                "2. Renseignez le titre, la catégorie et la date.\n"
                "3. Ajoutez le lieu et, si besoin, le lien Google Maps ou de visio.\n"
                "4. Cochez « Éligible à la carte d'engagement » pour que la présence validée "
                "ajoute un tampon.\n"
                "5. Enregistrez : l'activité apparaît dans l'agenda partagé."},
    {"title": "Valider une présence et ajouter un tampon [DEMO]", "module": "ENGAGEMENT",
     "role_scopes": ["PROFESSIONNEL"], "visibility": "ALL",
     "summary": "Scanner le QR d'un adhérent ou saisir son code en secours.",
     "content": "1. Ouvrez « Scanner un QR ».\n"
                "2. Autorisez la caméra, ou saisissez le code du QR dans le champ de secours.\n"
                "3. Choisissez l'activité ou l'événement réalisé.\n"
                "4. Cliquez sur « Valider la présence » : le tampon est ajouté et daté."},
    {"title": "Suivre son inventaire [DEMO]", "module": "STOCKS", "role_scopes": ["BUREAU"],
     "visibility": "BUREAU",
     "summary": "Ajouter un article, enregistrer un mouvement daté et son mode de paiement.",
     "content": "1. Dans « Stocks », cliquez sur « Nouvel article » et choisissez sa catégorie.\n"
                "2. Pour une entrée ou une sortie, ouvrez la fiche de l'article.\n"
                "3. Indiquez le type de mouvement, la quantité, le mode de paiement et la date.\n"
                "4. L'historique et le récapitulatif financier se mettent à jour aussitôt."},
    {"title": "Mon espace en trois minutes [DEMO]", "module": "PROFIL",
     "role_scopes": ["PARTICULIER", "BENEVOLE", "APPRENANT"], "visibility": "ALL",
     "summary": "Retrouver sa carte d'engagement, ses chiens et ses préférences.",
     "content": "1. « Ma carte d'engagement » affiche vos tampons et votre QR personnel.\n"
                "2. « Mon profil » regroupe vos informations et vos chiens.\n"
                "3. Dans « Mon espace & préférences », réglez la police adaptée, le contraste "
                "et le récap mensuel par e-mail."},
]

SHEETS = [
    {"role_title": "Présidence [DEMO]", "visibility": "ALL",
     "responsibilities": "Représente l'association, garantit le respect des statuts, valide les "
                         "décisions du Bureau et les engagements financiers.",
     "daily_actions": "Consulter la file de priorité, valider les demandes en attente, suivre les "
                      "indicateurs du tableau de bord.",
     "modules": ["ACCUEIL", "PROJETS", "FINANCES", "DOCUMENTS"]},
    {"role_title": "Référent activités [DEMO]", "visibility": "PRO_BUREAU",
     "responsibilities": "Programme les activités, coordonne les professionnels intervenants et "
                         "veille au bon déroulement des séances.",
     "daily_actions": "Créer et mettre à jour les activités, valider les présences, répondre aux "
                      "propositions des professionnels.",
     "modules": ["ACTIVITES", "EVENEMENTS", "TERRAIN", "ENGAGEMENT"]},
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    admin = await db.users.find_one({"role": "ADMIN_BUREAU"}, {"_id": 0, "user_id": 1})
    if not admin:
        print("Aucun compte Bureau trouvé.")
        return
    profile = await db.profiles.find_one({"user_id": admin["user_id"]}, {"_id": 0, "display_name": 1})
    author = (profile or {}).get("display_name") or "Bureau La Voix du Chien"
    now = "2026-08-22T09:00:00+00:00"

    created = 0
    for index, guide in enumerate(GUIDES):
        if await db.guides.find_one({"title": guide["title"]}):
            continue
        await db.guides.insert_one({
            "guide_id": f"gui_demo{index}", **guide, "status": "PUBLISHED",
            "author_id": admin["user_id"], "author_name": author, "is_pro_contribution": False,
            "review_comment": None, "activity_id": None,
            "created_at": now, "updated_at": now})
        created += 1

    sheets = 0
    for index, sheet in enumerate(SHEETS):
        title = f"Fiche de poste — {sheet['role_title']}"
        if await db.documents.find_one({"title": title}):
            continue
        await db.documents.insert_one({
            "document_id": f"doc_jobdemo{index}", "category": "FICHE_DE_POSTE", "proof_type": "AUTRE",
            "title": title, "status": "SIGNE", "date": now[:10], "member_id": admin["user_id"],
            "shared_with_user_ids": [admin["user_id"]], "reminder_sent": False, "file_id": None,
            "notes": "Fiche de démonstration.", **sheet,
            "created_by": admin["user_id"], "created_by_name": author,
            "created_at": now, "updated_at": now})
        sheets += 1

    print(f"{created} guide(s) et {sheets} fiche(s) de poste de démonstration créés.")

asyncio.run(main())
