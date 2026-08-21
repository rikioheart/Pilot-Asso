"""Données DEMO des phases 5, 6 et 7 (marquées [DEMO])."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


def _id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _d(days):
    return (_now() + timedelta(days=days)).date().isoformat()


async def seed_phases(db, notify):
    admin = await db.users.find_one({"role": "ADMIN_BUREAU"}, {"_id": 0, "user_id": 1})
    if not admin:
        return
    admin_id = admin["user_id"]
    pros = {u["email"]: u["user_id"] async for u in db.users.find(
        {"role": "PROFESSIONNEL"}, {"_id": 0, "email": 1, "user_id": 1})}
    pro1 = pros.get("pro1.demo@lavoixduchien.fr")
    pro2 = pros.get("pro2.demo@lavoixduchien.fr")
    member = await db.users.find_one({"email": "membre1.demo@lavoixduchien.fr"}, {"_id": 0, "user_id": 1})
    member_id = (member or {}).get("user_id")

    # ---------------------------------------------------------------- Blog
    if await db.articles.count_documents({"is_demo": True}) == 0:
        articles = [
            ("Cinq exercices pour un chien plus serein en balade [DEMO]", "CONSEIL",
             "Trois minutes par jour suffisent à transformer vos promenades.", ["éducation", "balade"],
             "PUBLISHED", True),
            ("Retour sur la journée à thème de printemps [DEMO]", "COULISSES",
             "Quarante participants, douze chiens et beaucoup de sourires.", ["événement"],
             "PUBLISHED", False),
            ("La classe de lecture canine expliquée simplement [DEMO]", "EDUCATION",
             "Quand les enfants lisent à un chien, la confiance grandit.", ["lecture", "enfants"],
             "PUBLISHED", False),
            ("Prévention : reconnaître les signaux d'apaisement [DEMO]", "PREVENTION",
             "Un chien parle avec son corps bien avant de grogner.", ["prévention"],
             "PENDING_REVIEW", False),
        ]
        for title, category, excerpt, tags, status, pinned in articles:
            await db.articles.insert_one({
                "article_id": _id("art"), "title": title, "excerpt": excerpt,
                "body": f"{excerpt}\n\nCet article de démonstration illustre la mise en page du blog interne "
                        f"de l'association. Il peut être relu, corrigé puis publié par le Bureau.",
                "category": category, "tags": tags, "cover_file_id": None, "access_level": "MEMBERS",
                "project_id": None, "status": status,
                "author_id": pro1 or admin_id, "author_name": "Camille Dubreuil [DEMO]",
                "is_pinned": pinned, "views": 12, "is_demo": True,
                "published_at": _iso(_now() - timedelta(days=4)) if status == "PUBLISHED" else None,
                "review_comment": None, "reviewed_by": None,
                "created_at": _iso(_now() - timedelta(days=6)), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Formations & lives
    if await db.formations.count_documents({"is_demo": True}) == 0:
        sessions = [
            ("Comprendre la communication canine [DEMO]", "FORMATION", _d(12), "18:30", 90, "PLANNED"),
            ("Live : questions-réponses éducation positive [DEMO]", "LIVE", _d(5), "20:00", 60, "PLANNED"),
            ("Interview d'un vétérinaire comportementaliste [DEMO]", "INTERVIEW", _d(-15), "19:00", 45, "DONE"),
        ]
        for title, fmt, date, start, duration, status in sessions:
            await db.formations.insert_one({
                "formation_id": _id("frm"), "title": title,
                "description": "Session de démonstration : contenu, intervenant et replay peuvent être modifiés.",
                "format": fmt, "speaker_name": "Camille Dubreuil [DEMO]", "speaker_user_id": pro1,
                "date": date, "start_time": start, "duration_minutes": duration,
                "location": "Visioconférence", "live_link": "https://meet.google.com/demo-vdc",
                "capacity": 30, "tags": ["éducation"], "cover_file_id": None,
                "access_level": "MEMBERS", "project_id": None, "status": status,
                "replay_url": "https://www.youtube.com/watch?v=demo" if status == "DONE" else None,
                "replay_file_id": None, "notes": None, "is_demo": True,
                "created_by": admin_id, "created_by_name": "Bureau La Voix du Chien",
                "created_at": _iso(_now() - timedelta(days=20)), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Bibliothèque / contenu exclusif
    if await db.library_items.count_documents({"is_demo": True}) == 0:
        resources = [
            ("Guide du premier chien [DEMO]", "GUIDE", "EXTERNAL_LINK", "MEMBERS", 0.0, None),
            ("Fiche pratique : la marche en laisse [DEMO]", "FICHE_PRATIQUE", "EXTERNAL_LINK", "MEMBERS", 0.0, None),
            ("Replay atelier propreté du chiot [DEMO]", "VIDEO", "EXTERNAL_LINK", "MEMBERS", 15.0, 9.0),
            ("Modèle de convention de partenariat [DEMO]", "MODELE", "EXTERNAL_LINK", "PROFESSIONALS", 0.0, None),
        ]
        for title, kind, ctype, access, public_price, member_price in resources:
            await db.library_items.insert_one({
                "item_id": _id("lib"), "title": title,
                "description": "Ressource de démonstration. Le Bureau peut remplacer le lien par un PDF hébergé.",
                "kind": kind, "content_type": ctype, "file_id": None,
                "external_url": "https://www.youtube.com/watch?v=demo" if kind == "VIDEO"
                else "https://docs.google.com/document/d/demo",
                "external_platform": "YOUTUBE" if kind == "VIDEO" else "GOOGLE_DRIVE",
                "cover_file_id": None, "tags": ["démo"], "access_level": access,
                "public_price": public_price or None, "member_price": member_price,
                "author_credit": "La Voix du Chien", "status": "ACTIVE", "download_count": 3,
                "is_demo": True, "created_by": admin_id, "created_by_name": "Bureau La Voix du Chien",
                "created_at": _iso(_now() - timedelta(days=10)), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Réseaux sociaux
    if await db.social_posts.count_documents({"is_demo": True}) == 0:
        posts = [
            ("Annonce de la balade collective [DEMO]", ["FACEBOOK", "INSTAGRAM"], _d(3), "SCHEDULED"),
            ("Portrait de bénévole du mois [DEMO]", ["INSTAGRAM"], _d(9), "DRAFT"),
            ("Rappel inscriptions journée à thème [DEMO]", ["FACEBOOK", "NEWSLETTER"], _d(1), "TO_VALIDATE"),
        ]
        for title, networks, date, status in posts:
            await db.social_posts.insert_one({
                "post_id": _id("pst"), "title": title,
                "content": "Texte de démonstration prêt à être copié dans l'outil de publication.",
                "networks": networks, "hashtags": ["#LaVoixDuChien", "#EducationPositive"],
                "scheduled_date": date, "scheduled_time": "10:00", "media_file_ids": [],
                "article_id": None, "project_id": None, "task_id": None,
                "assigned_user_id": pro2, "notes": None, "status": status,
                "published_at": None, "reminder_sent": False, "is_demo": True,
                "created_by": admin_id, "created_by_name": "Bureau La Voix du Chien",
                "created_at": _iso(_now() - timedelta(days=2)), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Jeu-concours
    if await db.contests.count_documents({"is_demo": True}) == 0:
        await db.contests.insert_one({
            "contest_id": _id("cts"), "title": "Photo de votre chien en balade [DEMO]",
            "description": "Partagez votre plus belle photo de balade et tentez de gagner un atelier offert.",
            "rules": "Jeu gratuit sans obligation d'achat, réservé aux adhérents à jour de cotisation. "
                     "Une participation par personne. Tirage au sort en présence du Bureau.",
            "prize": "Un atelier au choix offert", "start_date": _d(-5), "end_date": _d(20),
            "draw_date": _d(22), "winners_count": 1, "max_participants": None,
            "question": "En une phrase, qu'aimez-vous le plus dans vos balades ?",
            "cover_file_id": None, "access_level": "MEMBERS", "status": "OPEN",
            "winners": [], "drawn_at": None, "drawn_by": None, "is_demo": True,
            "created_by": admin_id, "created_by_name": "Bureau La Voix du Chien",
            "created_at": _iso(_now() - timedelta(days=5)), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Calendrier de l'Avent
    if await db.advent_calendars.count_documents({}) == 0:
        calendar_id = _id("adv")
        await db.advent_calendars.insert_one({
            "calendar_id": calendar_id, "year": _now().year,
            "title": f"Calendrier de l'Avent {_now().year} [DEMO]",
            "description": "Une surprise par jour pour les adhérents : astuces, cadeaux et codes promo.",
            "status": "ACTIVE", "preview_unlocked": True, "created_by": admin_id, "is_demo": True,
            "created_at": _iso(_now()), "updated_at": _iso(_now())})
        contents = [
            ("Astuce du jour : le rappel en trois pas", "ASTUCE", None),
            ("Une friandise offerte chez notre partenaire", "CADEAU", "Sachet de friandises"),
            ("-10 % sur la boutique partenaire", "CODE_PROMO", None),
            ("Vidéo : jouer intelligemment en intérieur", "LIEN", None),
            ("Le mot du Bureau", "MESSAGE", None),
        ]
        for day, (title, kind, reward) in enumerate(contents, start=1):
            await db.advent_boxes.insert_one({
                "box_id": _id("box"), "calendar_id": calendar_id, "day": day,
                "title": f"{title} [DEMO]", "content": "Contenu de démonstration de la case.",
                "kind": kind, "reward": reward,
                "promo_code": "VDC10" if kind == "CODE_PROMO" else None,
                "link": "https://www.lavoixduchien.fr" if kind == "LIEN" else None,
                "file_id": None, "is_published": True, "is_demo": True,
                "created_at": _iso(_now()), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Finances
    if await db.transactions.count_documents({"is_demo": True}) == 0:
        entries = [
            ("IN", 25.0, "COTISATION", "Cotisation annuelle — adhérent [DEMO]", -40),
            ("IN", 180.0, "ACTIVITE", "Balades collectives de mai [DEMO]", -30),
            ("IN", 420.0, "EVENEMENT", "Journée à thème printemps [DEMO]", -20),
            ("IN", 150.0, "PARTENARIAT", "Participation partenaire commercial [DEMO]", -15),
            ("OUT", 95.0, "ACHAT", "Goodies et supports pédagogiques [DEMO]", -18),
            ("OUT", 240.0, "ACHAT", "Assurance annuelle association [DEMO]", -60),
            ("OUT", 60.0, "AUTRE", "Location matériel journée à thème [DEMO]", -20),
        ]
        for direction, amount, category, description, offset in entries:
            await db.transactions.insert_one({
                "transaction_id": _id("trx"), "direction": direction, "date": _d(offset),
                "amount": amount, "category": category, "description": description,
                "payment_method": "VIREMENT", "activity_id": None, "event_id": None,
                "project_id": None, "professional_id": None, "member_id": None,
                "receipt_file_id": None, "status": "RECORDED", "is_demo": True,
                "created_by": admin_id, "created_by_name": "Bureau La Voix du Chien",
                "created_at": _iso(_now()), "updated_at": _iso(_now())})

    if pro1 and await db.distributions.count_documents({"is_demo": True}) == 0:
        distribution_id = _id("dst")
        await db.distributions.insert_one({
            "distribution_id": distribution_id, "label": "Journée à thème printemps [DEMO]",
            "scope": "EVENT", "activity_id": None, "event_id": None, "date": _d(-20),
            "total_amount": 420.0, "distributed_amount": 294.0, "association_amount": 126.0,
            "notes": "Répartition de démonstration : 40 % + 30 %, 30 % pour l'association.",
            "status": "VALIDATED", "is_demo": True, "created_by": admin_id,
            "created_at": _iso(_now()), "updated_at": _iso(_now())})
        for professional, name, percent, status in ((pro1, "Camille Dubreuil [DEMO]", 40, "PAID"),
                                                    (pro2, "Marion Lefèvre [DEMO]", 30, "PENDING")):
            if not professional:
                continue
            await db.distribution_lines.insert_one({
                "line_id": _id("dln"), "distribution_id": distribution_id, "date": _d(-20),
                "label": "Journée à thème printemps [DEMO]", "professional_id": professional,
                "professional_name": name, "mode": "PERCENT", "value": percent,
                "computed_amount": round(420.0 * percent / 100, 2), "status": status,
                "paid_at": _iso(_now()) if status == "PAID" else None, "is_demo": True,
                "created_at": _iso(_now())})

    if pro1 and await db.reimbursements.count_documents({"is_demo": True}) == 0:
        await db.reimbursements.insert_one({
            "reimbursement_id": _id("rmb"), "beneficiary_id": pro1,
            "beneficiary_name": "Camille Dubreuil [DEMO]",
            "reason": "Achat de croquettes pour l'atelier [DEMO]", "amount": 34.9,
            "status": "PENDING", "request_date": _d(-6), "paid_date": None,
            "proof_file_id": None, "notes": None, "is_demo": True,
            "created_by": pro1, "validated_by": None,
            "created_at": _iso(_now()), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Partenaires
    if await db.partners.count_documents({"is_demo": True}) == 0:
        partners = [
            ("Mairie de Nargis [DEMO]", "MAIRIE", "Commune", "M. le Maire", "Prêt du terrain communal",
             "Nargis (45)", "ACTIF", None, None),
            ("Refuge des Deux Rives [DEMO]", "ASSOCIATION", "Refuge", "Sophie Martin",
             "Échange de bonnes pratiques et sensibilisation", "Loiret (45)", "ACTIF", None, None),
            ("Animalerie du Gâtinais [DEMO]", "COMMERCIAL", "Animalerie", "Julien Bertrand",
             "Remise adhérents et dons de goodies", "Montargis (45)", "ACTIF",
             "Animalerie du Gâtinais SARL", "51234567800019"),
            ("Communauté de communes [DEMO]", "MAIRIE", "Intercommunalité", "Service associations",
             "Demande de subvention en cours", "Gâtinais (45)", "DISCUSSION", None, None),
        ]
        for name, category, ptype, contact, nature, zone, status, company, siret in partners:
            await db.partners.insert_one({
                "partner_id": _id("prt"), "name": name, "category": category, "partner_type": ptype,
                "contact_name": contact, "contact_role": "Référent",
                "contact_email": "contact.demo@exemple.fr", "contact_phone": "02 38 00 00 00",
                "geographic_zone": zone, "partnership_nature": nature, "status": status,
                "company_name": company, "siret": siret,
                "clauses": "Clauses de démonstration." if category == "COMMERCIAL" else None,
                "contract_file_ids": [], "internal_notes": "Fiche de démonstration.",
                "project_ids": [], "event_ids": [], "advantage_ids": [], "logo_file_id": None,
                "is_demo": True, "created_by": admin_id,
                "created_at": _iso(_now()), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Avantages adhérents
    if await db.advantages.count_documents({"is_demo": True}) == 0:
        advantages = [
            ("-10 % à l'Animalerie du Gâtinais [DEMO]", "CODE_PROMO", "VDC10",
             "Animalerie du Gâtinais", "Sur présentation de la carte d'adhérent.", 60, None),
            ("Une balade collective offerte [DEMO]", "ACTIVITE_OFFERTE", None, None,
             "Une balade par adhérent et par saison.", 90, 20),
            ("Bandana La Voix du Chien [DEMO]", "GOODIE", None, None,
             "Dans la limite du stock disponible.", 120, 15),
            ("Séance découverte avec un éducateur [DEMO]", "SEANCE_PRO", None, None,
             "Sur rendez-vous, réservée aux nouveaux adhérents.", 120, 10),
        ]
        for title, kind, code, partner, conditions, days, quantity in advantages:
            await db.advantages.insert_one({
                "advantage_id": _id("adv"), "title": title,
                "description": "Avantage de démonstration proposé aux adhérents.",
                "kind": kind, "promo_code": code, "partner_name": partner,
                "professional_id": pro1 if kind == "SEANCE_PRO" else None,
                "conditions": conditions, "valid_from": _d(-10), "valid_until": _d(days),
                "quantity": quantity, "access_level": "MEMBERS", "cover_file_id": None,
                "activity_id": None, "partner_id": None, "stock_item_id": None,
                "status": "ACTIVE", "used_count": 0, "is_demo": True, "created_by": admin_id,
                "created_at": _iso(_now()), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Terrains
    if await db.terrains.count_documents({"is_demo": True}) == 0:
        terrain_id = _id("ter")
        await db.terrains.insert_one({
            "terrain_id": terrain_id, "name": "Terrain communal de Nargis [DEMO]",
            "location": "Route de Courtempierre, 45210 Nargis",
            "description": "Terrain clôturé de 1 200 m², idéal pour les balades éducatives et ateliers collectifs.",
            "status": "DISPONIBLE", "surface": "1 200 m²", "capacity": 15,
            "equipment": ["Clôture 1,80 m", "Point d'eau", "Abri", "Parcours d'agilité léger"],
            "document_file_ids": [], "photo_file_id": None, "responsible_id": admin_id,
            "access_notes": "Clé à récupérer auprès du Bureau.", "is_demo": True,
            "created_by": admin_id, "created_at": _iso(_now()), "updated_at": _iso(_now())})
        await db.terrains.insert_one({
            "terrain_id": _id("ter"), "name": "Prairie du Moulin [DEMO]",
            "location": "Chemin du Moulin, 45210 Nargis",
            "description": "Grande prairie non clôturée réservée aux activités encadrées.",
            "status": "AMENAGEMENT", "surface": "3 000 m²", "capacity": 25,
            "equipment": ["Accès véhicule"], "document_file_ids": [], "photo_file_id": None,
            "responsible_id": admin_id, "access_notes": None, "is_demo": True,
            "created_by": admin_id, "created_at": _iso(_now()), "updated_at": _iso(_now())})
        for offset in (3, 5, 10, 12):
            await db.terrain_slots.insert_one({
                "slot_id": _id("slt"), "terrain_id": terrain_id, "date": _d(offset),
                "start_time": "09:00", "end_time": "12:00", "is_open": True,
                "comment": None, "is_demo": True, "created_by": admin_id, "created_at": _iso(_now())})
        if pro1:
            await db.terrain_reservations.insert_one({
                "reservation_id": _id("res"), "terrain_id": terrain_id,
                "terrain_name": "Terrain communal de Nargis [DEMO]", "date": _d(5),
                "start_time": "09:00", "end_time": "11:00", "category": "COLLECTIVE",
                "purpose": "Atelier marche en laisse [DEMO]", "expected_people": 8,
                "activity_id": None, "event_id": None, "project_id": None, "task_id": None,
                "professional_id": pro1, "status": "PENDING", "requested_by": pro1,
                "requested_by_name": "Camille Dubreuil [DEMO]", "review_comment": None,
                "validated_by": None, "is_demo": True,
                "created_at": _iso(_now()), "updated_at": _iso(_now())})

    # ---------------------------------------------------------------- Stocks
    if await db.stock_items.count_documents({"is_demo": True}) == 0:
        for name, description in (("Goodies", "Bandanas, porte-clés, tote bags"),
                                  ("Matériel pédagogique", "Longes, cônes, plots, cerceaux"),
                                  ("Supports de communication", "Flyers, affiches, kakémonos")):
            await db.stock_categories.insert_one({
                "category_id": _id("scat"), "name": f"{name} [DEMO]", "description": description,
                "is_demo": True, "created_by": admin_id, "created_at": _iso(_now())})
        items = [
            ("Bandana brodé [DEMO]", "Goodies [DEMO]", 14, 15, "pièce", 6.5),
            ("Tote bag coton [DEMO]", "Goodies [DEMO]", 32, 10, "pièce", 4.2),
            ("Longe 5 m [DEMO]", "Matériel pédagogique [DEMO]", 6, 4, "pièce", 18.0),
            ("Flyers présentation [DEMO]", "Supports de communication [DEMO]", 250, 100, "unité", 0.12),
        ]
        for name, category, quantity, threshold, unit, cost in items:
            item_id = _id("stk")
            await db.stock_items.insert_one({
                "item_id": item_id, "name": name, "category": category,
                "description": "Article de démonstration.", "quantity": quantity,
                "alert_threshold": threshold, "unit": unit, "responsible_id": admin_id,
                "partner_id": None, "professional_id": None, "origin": "Don partenaire [DEMO]",
                "location": "Local associatif", "unit_cost": cost, "status": "ACTIVE",
                "is_demo": True, "created_by": admin_id,
                "created_at": _iso(_now()), "updated_at": _iso(_now())})
            await db.stock_movements.insert_one({
                "movement_id": _id("mvt"), "item_id": item_id, "item_name": name,
                "direction": "IN", "quantity": quantity, "reason": "Stock initial [DEMO]",
                "related_user_id": None, "related_user_name": None,
                "quantity_before": 0, "quantity_after": quantity, "is_demo": True,
                "created_by": admin_id, "created_by_name": "Bureau La Voix du Chien",
                "created_at": _iso(_now() - timedelta(days=12))})
        await notify(admin_id, type="STOCK_ALERT", title="Stock bas [DEMO]",
                     message="« Bandana brodé [DEMO] » : 14 pièce(s) restante(s) (seuil 15).",
                     level="WARNING", link="/stock")

    # ---------------------------------------------------------------- Documents & formulaires
    if await db.documents.count_documents({"is_demo": True}) == 0:
        docs = [
            ("Statuts de l'association [DEMO]", "STATUTS", "SIGNE", None),
            ("Assurance responsabilité civile [DEMO]", "ASSURANCE", "SIGNE", _d(25)),
            ("Convention terrain communal [DEMO]", "CONVENTION", "EN_COURS", _d(150)),
            ("Contrat partenaire animalerie [DEMO]", "CONTRAT", "A_RENOUVELER", _d(20)),
        ]
        for title, category, status, expiry in docs:
            await db.documents.insert_one({
                "document_id": _id("doc"), "title": title, "category": category,
                "date": _d(-90), "status": status, "expiry_date": expiry, "file_id": None,
                "partner_id": None, "project_id": None, "terrain_id": None,
                "notes": "Document de démonstration (aucun fichier joint).",
                "shared_with_user_ids": [], "reminder_sent": False, "is_demo": True,
                "created_by": admin_id, "created_at": _iso(_now()), "updated_at": _iso(_now())})

    if await db.external_forms.count_documents({"is_demo": True}) == 0:
        forms = [
            ("Retour sur une activité [DEMO]", "RETOUR_ACTIVITE",
             ["ADMIN_BUREAU", "PROFESSIONNEL", "PARTICULIER"]),
            ("Ajouter un chien à mon profil [DEMO]", "AJOUT_CHIEN", ["PARTICULIER", "ADMIN_BUREAU"]),
            ("Candidature bénévole [DEMO]", "CANDIDATURE_BENEVOLE", ["PARTICULIER", "ADMIN_BUREAU"]),
        ]
        for title, usage, roles in forms:
            await db.external_forms.insert_one({
                "form_id": _id("frmx"), "title": title,
                "description": "Formulaire externe de démonstration hébergé chez Google Forms.",
                "url": "https://docs.google.com/forms/d/e/demo/viewform", "usage": usage,
                "activity_id": None, "event_id": None, "allowed_roles": roles,
                "allowed_levels": [], "extra_user_ids": [], "status": "ACTIVE", "is_demo": True,
                "created_by": admin_id, "created_at": _iso(_now()), "updated_at": _iso(_now())})

    if member_id and await db.contest_participants.count_documents({"is_demo": True}) == 0:
        contest = await db.contests.find_one({"is_demo": True}, {"_id": 0, "contest_id": 1, "title": 1})
        if contest:
            await db.contest_participants.insert_one({
                "participation_id": _id("cpt"), "contest_id": contest["contest_id"],
                "user_id": member_id, "user_name": "Julie Moreau [DEMO]",
                "answer": "Le calme du matin et la complicité avec mon chien.",
                "accepted_rules_at": _iso(_now()), "is_winner": False, "is_demo": True,
                "created_at": _iso(_now() - timedelta(days=2))})
    _ = secrets
