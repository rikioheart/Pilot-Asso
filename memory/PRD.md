# PRD — Plateforme interne « La Voix du Chien »

## Problème initial
Cockpit opérationnel interne pour l'association française **La Voix du Chien** (Nargis, Loiret) :
centraliser gouvernance, membres, chiens, projets, tâches, événements, partenariats, finances et ressources.
**Règles strictes** : aucune fonctionnalité d'adoption · pas de Supabase · pas de dépendance GitHub ·
aucun paiement en ligne intégré. Interface et contenus **100 % en français**.

**Stack** : React + Tailwind + shadcn/ui · FastAPI · MongoDB · WebSocket temps réel · RBAC strict côté backend.
**Charte** : marine `#002060`, bordeaux `#800020`, logo officiel (`/frontend/public/logo-vdc.png`).

## Rôles
- **ADMIN_BUREAU** (Bureau, 3 gestionnaires) — accès complet
- **PROFESSIONNEL** (PRO_STANDARD / PRO_AVANCE / PRO_COORDINATEUR)
- **PARTICULIER** (MEMBRE_STANDARD / MEMBRE_IMPLIQUE / BENEVOLE / REFERENT)

## Livré

### Phases 1 à 8 + Prompts 1 & 2 — validés lors des itérations précédentes
Auth JWT + Google managé, RBAC, profils, dashboards, notifications WebSocket · Projets, tâches Kanban,
validation, import CSV, annuaire pro · Activités, événements, calendrier, carte de fidélité + QR,
statistiques, mindmap · Blog, formations, bibliothèque, planificateur réseaux sociaux, concours, Avent ·
Finances, parts pros, remboursements, avantages adhérents · Partenaires, terrains, stocks, documents,
formulaires · Notifications hiérarchisées, file de priorité Bureau, 8 exports Excel, onboarding, crons ·
Accessibilité (OpenDyslexic, contraste, mode focus) et espaces pros qualifiés · Fiches chiens,
suivi de cas et comptes-rendus de séances avec visibilité au cas par cas.

### Prompt 3 — Activités, Événements, Terrain & Calendriers (21/08/2026, testé 100 %)
- **Lot C** : tarifs horaires par catégorie fixés par le Bureau (7 catégories), réservation par les pros
  avec estimation du montant, validation/refus tracés, **écriture financière provisoire** créée à la
  validation puis **marquée encaissée** après la séance ; détection des conflits de créneaux ;
  mise à disposition gratuite sans écriture ; nouvelle page **Agenda partagé** (`/agenda`) filtrée par
  rôle (Particulier ne voit pas les réservations, Pro ne voit que les siennes) ; bouton Google Calendar
  **désactivé** (« bientôt disponible ») sur l'agenda et dans les préférences.
- **Lot A** : panneau latéral de **création rapide** (activités, événements, partenaires, avantages,
  qualification d'un professionnel) accessible depuis l'en-tête du Bureau ; onglet « Archiver » avec
  **archivage récupérable**, restauration et **suppression définitive**, motif obligatoire et tracé
  (`/api/records/{entity}`).
- **Lot B** : fiches enrichies (lien Google Maps, visio/distanciel + lien, formulaire associé avec date de
  notification, éligibilité carte d'engagement), ajout de participants depuis la fiche, visibilité par
  élément (tous les membres / pros + Bureau / Bureau seul), **nomenclatures configurables** par le Bureau
  (catégories et types d'activités, types d'événements) dans Administration, libellés entièrement français.

### Prompt 4 — Engagement, QR Code & Fidélité (21/08/2026, testé 100 % — 23/23 backend)
- Onglet Bureau renommé **Engagement** (`/admin/engagement`) : cartes des membres, historique des tampons,
  règles & paliers
- Historique daté complet : élément concerné, professionnel ou membre du Bureau, date et **mode
  d'obtention** (scan QR, validation pro, ajout Bureau, validation automatique de présence)
- Filtres et tris : par membre, par activité, par date, par mode d'obtention
- Éligibilité carte d'engagement sur **activités et événements** ; **tampon automatique** à la validation
  de présence (nouvel endpoint de présence pour les activités)
- **Ajout / retrait manuel** par le Bureau avec motif obligatoire, identifié comme manuel, total recalculé,
  retrait bloqué sous zéro ; **annulation d'une ligne précise** avec motif
- **QR Code personnel** : téléchargeable en PNG par le Particulier, régénérable par le membre **et par le
  Bureau** (l'ancien devient immédiatement invalide, vérifié par test)
- Scan pro : profil simplifié, validation en un clic, **saisie manuelle du code** en secours
- Paliers existants conservés et modifiables (seuil + avantage) par le Bureau

### Prompt 5 — Statistiques d'engagement & récap mensuel adhérent (21/08/2026, testé 100 % — 10/10)
- Onglet **Statistiques** dans Engagement : 4 KPI (tampons attribués, tampons cumulés, adhérents engagés,
  taux de participation), **classement des membres les plus impliqués**, répartition par **mode
  d'obtention**, **paliers atteints par mois** avec le détail des membres concernés, éléments les plus
  tamponnés
- **Récap mensuel de l'adhérent** : notification dans la plateforme **et** e-mail (Resend managé), envoyé
  chaque **1er du mois à 9 h** (cron `recap-mensuel-adherents`, idempotent) ; encart récap sur la carte
  d'engagement du Particulier ; **désabonnement de l'e-mail** possible dans « Mon espace & préférences »
  (la notification reste active) ; envoi manuel possible par le Bureau depuis la page Engagement
- Mise à jour partielle des préférences (dot-notation Mongo) : plus d'écrasement des modules masqués

### Prompt 5 bis — Stocks, Inventaire & Documents (22/08/2026, testé 100 % — 40/40 avec le Prompt 6)
- Mouvements de stock enrichis : **mode de paiement** (espèces, virement, carte, don, autre), **date
  pré-remplie et modifiable** pour les saisies rétroactives, montant, visibles dans l'historique de
  l'article et dans le **récapitulatif financier des stocks** (par mode de paiement + valeur du stock)
- Inventaire **catégorisé obligatoire** (8 catégories par défaut créées automatiquement), vues
  **kanban et tableau**, recherche et filtre par catégorie, ajout/renommage de catégories depuis les
  paramètres (répercussion automatique sur les articles), suppression avec confirmation tracée
  (archivage récupérable ou suppression définitive)
- **Lien article ↔ projet ou tâche**, visible depuis la fiche article et depuis la fiche projet
- Documents en **kanban/tableau** classés par catégorie et **type de preuve**, nouvelle visibilité
  **« Professionnels + Bureau »**, catégories personnalisables, édition directe de tout élément
  (catégorie, type, visibilité, description) et suppression confirmée tracée
- Scan/tampon d'engagement étendu à **tous les niveaux Professionnel** (PRO_STANDARD inclus)

### Prompt 6 — Fiches de poste, Guides, Espace aide & Suivi pros (22/08/2026, testé 100 % — 40/40)
- **Fiches de poste** rédigées dans la plateforme (titre du rôle, responsabilités, actions
  quotidiennes, modules utilisés), classées dans Documents, liées au profil du membre, visibilité
  choisie au cas par cas (tous / pros + Bureau / Bureau seul), suppression confirmée
- **Guides d'utilisation** par rôle (Bureau, Professionnel, Particulier, Bénévole, Apprenant) et par
  module ; un Professionnel peut **proposer une fiche métier**, soumise à validation du Bureau qui
  choisit la visibilité en publiant ; refus motivé notifié à l'auteur
- **Espace aide central** `/aide` pour tous les rôles : recherche par mot-clé, filtres module et rôle,
  guides groupés par module, fiches de poste visibles, ressources de la bibliothèque ; respecte les
  préférences d'accessibilité (police adaptée, taille, contraste) déjà en place
- **Suivi qualitatif des professionnels** strictement réservé au Bureau (jamais visible du pro
  concerné ni des autres membres), daté et signé, historique complet depuis l'annuaire
- **Récapitulatif annuel automatique** du professionnel (activités animées, événements, bénévolat,
  projets, séances, réservations, tâches, parts) consultable par le Bureau et **exportable en Excel**
  (7 feuilles)

### Prompt 8C — Commentaires, intégrations Google, météo & paiements manuels (04/09/2026, testé 100 % — backend 12/12, frontend OK)
- **Commentaires unifiés** (`comments.py`, collection `comments`) sur tâches, événements et activités :
  CRUD + pagination, visibilité **Tous** / **Pros + Bureau**, **@mentions** (sélection des participants/équipe)
  déclenchant une notification push ; composant réutilisable `<CommentSection>`. **Remplace** l'ancien
  mini-système de commentaires des tâches (le bouton commentaire ouvre désormais le module unifié).
- **Google Maps / Meet / Forms** (sans clé API) : champs `address` (événements), `google_meet_url`
  (événements), `google_forms_url` (événements, activités, tâches) ; boutons « Rejoindre via Google Meet »
  et « Ouvrir le formulaire Google » ; **aperçu Maps via iframe `output=embed` chargé uniquement au clic**
  + lien « Itinéraire ».
- **Météo OpenWeatherMap** (`weather.py`) à la demande, prévisions 3 jours pour activités/événements
  avec adresse/lieu. **Construit sans clé** : la clé est saisie par le Bureau dans Réglages
  (section « Météo (OpenWeatherMap) ») ; tant qu'aucune clé n'est saisie, le bloc affiche
  « **Météo non configurée** ».
- **Suivi manuel des paiements** (`payments.py`, collection `payments`) — **aucune passerelle en ligne** :
  types cotisation/activité/autre, montant en €, statuts payé/en attente/en retard, mode de règlement,
  vue Bureau `/paiements` (récap + tableau + filtres + CRUD) et historique en lecture seule pour le membre.
  **Bascule automatique en « en retard » 21 jours (3 semaines) après la date de saisie** via
  `sweep_overdue_payments()` branché sur le cron quotidien `rappels-quotidiens`.
- Correctif : `.emergent/crons.yml` réparé (entrée `recap-lundi` corrompue → 4 crons valides).

## Architecture backend
`server.py` · `deps.py` · `rbac.py` · `storage.py` · `content.py` · `community.py` · `finance.py` ·
`comments.py` (commentaires unifiés) · `payments.py` (paiements manuels + bascule 21 j) · `weather.py` (OpenWeatherMap) ·
`partners.py` · `terrain.py` · `stock.py` · `documents.py` · `exports.py` · `crons_api.py` ·
`profiles_plus.py` · `dogs.py` · `activities.py` (+ taxonomies, participants, présences) · `loyalty.py`
(engagement) · `records.py` (archivage / suppression tracés) · `help_center.py` (fiches de poste,
guides, espace aide, suivi et récap annuel des pros) · `seed_demo.py` + `seed_phases.py` +
`seed_help.py` · `cleanup_test_data.py` (nettoyage des données TEST_)

## Backlog priorisé

### P0
- **Synchronisation Google Calendar** unidirectionnelle (plateforme → Google), sélection manuelle,
  Bureau vers agenda dédié, pros sur leurs éléments, aucune sync pour les particuliers
  → nécessite l'intégration OAuth Google Calendar (playbook + identifiants)

  → **reporté à la demande du client** (21/08/2026) : toute l'UI est prête, le bouton reste inactif
  jusqu'à la fourniture des identifiants

### P1
- Prompt 7 : intégration Rintintin Pro et déduplication d'agenda (indicateur d'origine déjà en place)
- Statistiques enrichies : indicateurs d'engagement (tampons, paliers atteints) et finances
- Exports PDF des récapitulatifs financiers (en plus d'Excel/CSV)
- Délégation fine des validations à des professionnels de confiance (UI dédiée)

### P2
- Recherche globale étendue aux chiens, partenaires et documents
- Pagination des listes longues (`/api/loyalty/members` : N+1 à optimiser si la base grossit)
- Notifications e-mail individuelles optionnelles par membre
