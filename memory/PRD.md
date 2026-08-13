# PRD — Plateforme interne « La Voix du Chien »

## Problème initial (résumé fidèle)
Construire le cockpit opérationnel interne de l'association française « La Voix du Chien » (Nargis, Loiret) : gouvernance, membres, professionnels, particuliers, chiens, projets/tâches/validations, activités, événements, partenariats, mairies, terrain, blog/communication, formations, stocks, campagnes, carte de fidélité QR, finances opérationnelles, remboursements, documents, notifications temps réel, mindmap, RBAC fin, audit.
Interdits absolus : adoption, paiement en ligne, Supabase, dépendance GitHub, e-mails externes en V1.
Développement par phases avec test après chaque phase. Phase 1 uniquement dans cette itération.

## Architecture technique
- Frontend : React 19 (CRA + craco, JSX), Tailwind, shadcn/ui, lucide-react, react-router 7, sonner. (TypeScript non appliqué : template CRA JS conservé pour la fiabilité — à arbitrer plus tard.)
- Backend : FastAPI (`/app/backend/server.py`), Pydantic, motor/MongoDB, WebSocket natif pour les notifications.
- RBAC : `/app/backend/rbac.py` — ROLE (ADMIN_BUREAU / PROFESSIONNEL / PARTICULIER) + NIVEAU + permissions + overrides (granted/revoked). Vérification exclusivement serveur (`require(permission)`, `require_admin`, `active_user`).
- Auth : JWT email/mot de passe (cookies httpOnly + fallback Bearer), bcrypt, anti-brute-force, reset token ; ET Google géré par Emergent (`/api/auth/session`, sessions 7 jours).
- Collections Phase 1 : `users`, `profiles`, `dogs`, `notifications`, `audit_logs`, `user_sessions`, `login_attempts`, `password_reset_tokens` + index (email unique, role, status, recipient/is_read, timestamp…).

## Personas
- Membre du Bureau (admin complet, compte individuel) : pilote, valide, arbitre.
- Professionnel (PRO_STANDARD / AVANCE / COORDINATEUR) : propose, participe, coordonne, suit ses finances.
- Particulier (STANDARD / IMPLIQUE / BENEVOLE_VALIDE / REFERENT_BENEVOLE) : inscriptions, chiens, bénévolat, fidélité.

## Exigences structurelles (stables)
CLARTÉ → SIMPLICITÉ → FIABILITÉ → SÉCURITÉ → PETITS PROGRÈS → TRAÇABILITÉ → COLLABORATION → ÉVOLUTIVITÉ.
Logique fondamentale : ACTION → PREUVE → VALIDATION → HISTORIQUE → PROGRESSION.
Pas de suppression physique des données importantes (ARCHIVE / SUSPENDED / CANCELLED).

## Implémenté (juin 2026 — Phase 1)
- Page /login : connexion, création de compte (Professionnel / Particulier → statut PENDING), mot de passe oublié, Google.
- Écran « Demande en cours d'examen » pour les comptes non validés ; accès applicatif bloqué côté serveur.
- Dashboard Bureau (/admin/dashboard) : 6 KPI cliquables, widget « Progression cette semaine », adhésions en attente, fil d'activité.
- Dashboard Professionnel (/pro/dashboard) et Particulier (/member/dashboard) avec KPI, droits et historique.
- Membres (/admin/members) : filtres statut/rôle/recherche, valider, refuser, suspendre, réactiver, changer rôle + niveau (contrôle de cohérence).
- Notifications : moteur interne + WebSocket `/api/ws/notifications`, cloche avec compteur non lus, panneau, page /notifications avec filtres et « tout marquer comme lu ».
- Journal d'audit (/admin/audit) et matrice RBAC lisible (/admin/settings).
- Profil (/profile) : informations, mes chiens (ajout/suppression, pas de dossier médical), mes droits.
- Recherche globale dans le header (membres, chiens) avec portée selon le rôle.
- Données DEMO marquées [DEMO] : 5 comptes + 2 chiens (dont 1 adhésion en attente).
- Tests : 36 tests backend (pytest, `/app/backend/tests/`) + parcours Playwright — tous verts. Sécurité RBAC/401/403 validée.

## Backlog priorisé
- P0 — Phase 2 : projets, sous-projets, tâches/sous-tâches, équipes, deadlines, Kanban, workflow de validation (PENDING_VALIDATION), task_history, statut NEEDS_HELP, templates de projets.
- P0 — Phase 3 : professionnels (professional_details), annuaire, adhésions, niveaux d'implication, badges/fonctions.
- P1 — Phase 4 : activités, événements, calendrier, inscriptions, participations.
- P1 — Phase 5 : partenaires, avantages, codes promo, propositions professionnelles, contrats.
- P1 — Phase 6 : carte de fidélité (QR sécurisé, scan, recherche manuelle, règles configurables).
- P2 — Phase 7 : finances opérationnelles (recettes/dépenses/net, répartition multi-pros à 100 %, remboursements).
- P2 — Phase 8 : mindmap React Flow. Phase 9 : terrain/stocks/campagnes. Phase 10 : blog/communication/formations. Phase 11 : statistiques, exports, import CSV, optimisation.

## Prochaines tâches
1. Phase 2 (projets/tâches/validation/Kanban/historique).
2. Phase 3 (annuaire professionnel et adhésions détaillées).
3. Import CSV avec mapping et détection de doublons (Administration).
