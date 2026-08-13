# PRD — Plateforme interne « La Voix du Chien »

## Problème initial (résumé fidèle)
Construire le cockpit opérationnel interne de l'association française « La Voix du Chien » (Nargis, Loiret) : gouvernance, membres, professionnels, particuliers, chiens, projets/tâches/validations, activités, événements, partenariats, mairies, terrain, blog/communication, formations, stocks, campagnes, carte de fidélité QR, finances opérationnelles, remboursements, documents, notifications temps réel, mindmap, RBAC fin, audit.
Interdits absolus : adoption, paiement en ligne, Supabase, dépendance GitHub, e-mails externes en V1.
Développement par phases avec test après chaque phase.

## Architecture technique
- Frontend : React 19 (CRA + craco, JSX), Tailwind, shadcn/ui, lucide-react, react-router 7, sonner. (TypeScript non appliqué : template CRA JS conservé pour la fiabilité.)
- Backend : FastAPI modulaire — `deps.py` (base, auth, permissions, notifications, audit), `server.py` (auth, membres, chiens, dashboards, audit, recherche), `projects.py` (projets/tâches/équipes/aide), `professionals.py` (annuaire), `imports_csv.py` (import), `rbac.py`, `seed_demo.py`.
- RBAC : ROLE (ADMIN_BUREAU / PROFESSIONNEL / PARTICULIER) + NIVEAU + permissions + overrides, plus contexte projet (owner/coordinateur) et visibilité. Vérification exclusivement serveur.
- Auth : JWT email/mot de passe (cookies httpOnly + Bearer), bcrypt, anti-brute-force, reset token ; ET Google géré par Emergent.
- Collections : users, profiles, dogs, notifications, audit_logs, user_sessions, projects, project_teams, tasks, task_history, help_requests, professional_details, import_runs (+ index sur email, role, status, deadline, project_id, assigned_user_id, recipient/is_read, timestamp).

## Personas
- Membre du Bureau : pilote, valide après preuve, arbitre, importe les données.
- Professionnel (PRO_STANDARD / AVANCE / COORDINATEUR) : propose, coordonne des projets, exécute et soumet des tâches, tient sa fiche d'annuaire.
- Particulier (STANDARD / IMPLIQUE / BENEVOLE_VALIDE / REFERENT_BENEVOLE) : chiens, missions bénévoles, demandes d'aide.

## Exigences structurelles (stables)
CLARTÉ → SIMPLICITÉ → FIABILITÉ → SÉCURITÉ → PETITS PROGRÈS → TRAÇABILITÉ → COLLABORATION → ÉVOLUTIVITÉ.
Logique fondamentale : ACTION → PREUVE → VALIDATION → HISTORIQUE → PROGRESSION.
Pas de suppression physique par défaut (ARCHIVE / SUSPENDED / CANCELLED) ; les non-admins ne suppriment jamais une tâche.

## Implémenté
### Juin 2026 — Phase 1 (fondations)
- Connexion / création de compte (PENDING validé par le Bureau), Google, mot de passe oublié.
- Dashboards Bureau / Professionnel / Particulier, sidebar dynamique, header (recherche globale, cloche temps réel).
- Membres : validation, refus, suspension, réactivation, rôle + niveau, overrides de permissions.
- Notifications internes + WebSocket, page /notifications, journal d'audit, matrice RBAC, profil + chiens.
- Données DEMO marquées [DEMO]. Tests : 36/36 backend + parcours Playwright.

### Juin 2026 — Phase 2 + annuaire + import + aide
- Projets : Kanban (glisser-déposer), liste, filtres (catégorie, en retard, recherche), sous-projets, templates (journée thématique, article blog, formation, événement), progression automatique, archivage, visibilité par mode.
- Équipes projet : rôles contextuels OWNER/COORDINATOR/CONTRIBUTOR/VOLUNTEER/EXPERT/REVIEWER, ajout/retrait, demande pour rejoindre.
- Tâches et sous-tâches : attribution, deadlines (chips « J-x / en retard »), dépendances (bloquée par), bénévolat ouvert + claim, commentaires, preuve, soumission → PENDING_VALIDATION → validation Bureau (ACCEPT / demande de modification motivée), task_history complet, suppression réservée au Bureau.
- Page /admin/validation : cartes avec membre, projet, date, preuve, commentaires, boutons Valider / Demander une modification.
- Annuaire professionnel filtrable (catégorie, département, spécialité, recherche) + fiche détaillée en tiroir ; onglet « Ma fiche pro » dans le profil ; champs partenariat/contrats/documents masqués aux non-admins.
- Import CSV (Administration) : analyse, mapping proposé, prévisualisation, doublons internes et comptes existants, lignes sans e-mail, exécution sans écrasement silencieux (conflits listés), option de mise à jour explicite, historique des imports.
- « J'ai besoin d'aide » / « Je peux aider sur… » dans le header et sur chaque tâche → notification au Bureau, page /admin/help, widget « Qui a besoin d'aide », réponse et résolution.
- Dashboard Bureau enrichi (12 KPI dont projets actifs, tâches à valider, en retard, besoins d'aide, bénévolat ouvert, bloquées) + « Progression cette semaine ».
- Tests : 66/66 backend (36 Phase 1 + 30 Phase 2, `/app/backend/tests/`) et 12/12 parcours frontend desktop + mobile.

## Backlog priorisé
- P0 — Phase 3 : adhésions détaillées, badges/fonctions (fondateur, représentants), niveaux d'implication avancés, fiche membre complète côté Bureau.
- P0 — Phase 4 : activités, événements, calendrier, inscriptions, participations, bénévoles.
- P1 — Phase 5 : partenaires (mairies, associations, commerces), avantages, codes promo, propositions professionnelles, contrats.
- P1 — Phase 6 : carte de fidélité (QR sécurisé, scan caméra, recherche manuelle, règles configurables, historique).
- P2 — Phase 7 : finances opérationnelles (recettes/dépenses/net, répartition multi-pros = 100 %, remboursements, part association).
- P2 — Phase 8 : mindmap React Flow. Phase 9 : terrain/stocks/campagnes. Phase 10 : blog/communication/formations. Phase 11 : statistiques stratégiques, exports, optimisation.
- Dette technique notée : `projects.py` à scinder (projects/tasks/help) s'il grossit ; limite de taille sur l'upload CSV ; modèle Pydantic pour PUT /help-requests.

## Prochaines tâches
1. Phase 4 (activités, événements, calendrier, inscriptions) — la plus visible pour les adhérents.
2. Phase 3 (fiche membre complète, badges de fonction, adhésions).
3. Phase 6 (carte de fidélité + QR) pour l'usage terrain sur mobile.
