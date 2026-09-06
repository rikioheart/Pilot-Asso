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

### Prompt 8D — Lot A : Carnet de suivi du chien (04/09/2026, testé 100 % backend + frontend)
- **Modèle configurable** par le Bureau (`settings/dog-journal-template`) : sections objectifs/progression/
  séances/notes/photos, ajout/renommage/suppression, appliqué à tous les chiens.
- **Carnet par chien** (`dog_journal.py`, collection `dog_journals`) : activation double (Bureau **et**
  propriétaire) ; le Bureau/Pro remplit toutes les sections dès activation Bureau ; le Particulier écrit
  uniquement dans les sections que le Bureau lui a ouvertes, sinon lecture seule.
- **Jauges de progression** par objectif (ex. « Rappel : 3/5 ») qui se remplissent à chaque séance validée
  (+1/−1 par Bureau/Pro).
- **Photos** avec **compression automatique côté navigateur** (`imageCompress.js`, redimension 1600px / JPEG 0.8)
  puis stockage Object Storage.

### Prompt 8D — Lot B : Vie de l'association & communauté (04/09/2026, testé backend 100 % / frontend 100 % après correctif)
- **Fil d'actualité** (`news.py`, collection `news`) : le Bureau publie de courtes actualités datées non
  commentables, avec **programmation** à l'avance (publish_at) ; affiché sur les 3 dashboards (`NewsFeed`).
- **Mise en avant épinglée** « Chien de la semaine » / « Réussite » (photo + description, une seule à la fois)
  + **confettis discrets** à l'ouverture (une fois par mise en avant, respect `prefers-reduced-motion` et flag
  `vdc_animations_off`). Rafraîchissement du fil via évènement `news:updated`.
- **Récap bihebdomadaire personnalisé** : réglages Bureau (`settings/biweekly-recap` : enabled + intro),
  greffé sur le cron existant `recap-email` (1 & 15) via `send_member_biweekly_recaps`, notification in-app,
  désabonnement par la préférence membre `biweekly_recap`.
- **Badges de fidélité** : `RuleIn.badge`/`badge_name`, badges atteints exposés (`card_payload.badges`,
  `GET /loyalty/badges`) et affichés sur la carte d'engagement + dashboard membre.
- **Relances bienveillantes** : 3 modèles pré-rédigés (`GET /nudge-templates`) ; le dialogue de relance propose
  des suggestions personnalisables avant envoi.

### Prompt 8D — Lot C : Participation & propositions (04/09/2026, testé 100 % backend + frontend)
- **Participation à 3 états** (`rsvp.py`, collection `rsvps`) sur activités, événements, tâches (et créneaux
  terrain côté API) : « Je participe » = inscription existante (compte dans la capacité), « Peut-être » /
  « Pas possible » = simple réponse sans place. Compteurs séparés avec répartition par rôle ; détail nominatif
  visible Bureau/Pro, totaux seuls pour le Particulier. Composant `ParticipationControl`.
- **Propositions** : les notifications de proposition (activités/événements) vont désormais au Bureau **et**
  aux `PRO_COORDINATEUR` (`notify_coordinators`) ; l'auteur est notifié de l'acceptation/refus commenté
  (flux `review` existant).
- **Mentions @profil à la création** d'activité/événement/tâche (`MentionPicker`) → notification `MENTION`.
- **Badges de fidélité dans l'annuaire** : affichés sur la fiche pro (drawer `/directory`) via
  `GET /loyalty/badges`.

### Prompt 8E — Lot A (partie 1) : 3 thèmes visuels (04/09/2026, testé)
- 3 thèmes fixes (`ThemeProvider.THEMES`) : **T1** clair (défaut, bordeaux/bleu nuit/blanc), **T2** Bordeaux
  (actions bleu nuit), **T3** sombre (fond bleu nuit profond, texte blanc, accents bordeaux, classe `.dark`).
- Thème par défaut choisi par le Bureau (`PUT /settings/theme {theme_key}`, sélecteur `ThemeSettings`).
- **Override par utilisateur** dans « Mon espace » (`DisplayPreferences`), mémorisé en `preferences.theme` +
  localStorage `vdc_user_theme` ; le choix perso prime toujours sur le défaut Bureau.
- Reste à faire (Lot A partie 2) : **icônes par module** choisies par le Bureau.

### Prompt 8E — Lot A (partie 2) : Icônes par module (04/09/2026, testé 100 %)
- Bibliothèque Lucide prédéfinie (`lib/moduleIcons.js`) ; le Bureau choisit une icône par module
  (`ModuleIconsSettings`, `settings/module-icons`) ; `AppShell.iconFor` résout par chemin, texte toujours visible.

### Prompt 8E — Lot B : Couverture + fiches chiens enrichies (04/09/2026, testé 100 %)
- **Photo de couverture** (`settings/cover-photo`, `CoverBanner`, `CoverPhotoSettings`) en haut des 3 dashboards,
  upload compressé côté navigateur.
- **Fiche chien enrichie** : grande photo (hero), nom en grand titre, blocs d'infos aérés (`InfoBlock`),
  sections existantes conservées dessous.

### Prompt 8E — Lot C : Page publique (04/09/2026, testé 100 %)
- Page `/public` sans authentification (`public_api.py`, `pages/Public.jsx`) : agenda public (événements PUBLIC),
  professionnels avec **QR carte de visite** (réutilise `ProCardQr` + `/carte/:userId`), galerie d'activités.
- Le Bureau contrôle les sections visibles (`settings/public-page` : enabled/show_events/show_pros/show_gallery/intro)
  et le lien est partageable (`PublicPageSettings`).

### Prompt 8F — Lot A : Confort de lecture & animations (05/09/2026, backend+persistance vérifiés par curl, compile OK)
- **Curseur de taille de texte 14–24px** appliqué instantanément à toute l'interface (`document.documentElement.style.fontSize`, échelle rem globale) via `ThemeProvider`.
- **Contrôle global des animations** (case à cocher, indépendant du thème) + respect `prefers-reduced-motion` → classe `.reduce-motion` neutralisant animations/transitions.
- Contrôles dans « Mon espace › Affichage & accessibilité » (`DisplayPreferences`), mémorisés dans
  `preferences.text_size` / `animations_off` (modèle `Preferences` étendu) + localStorage pour l'instantané.
- Reste du Prompt 8F à faire (lots suivants) : langage constructif systématique, palette d'alerte adoucie,
  morcellement des formulaires >5 champs (stepper), autosave brouillons (30s + restauration 7j),
  emplacement fixe de l'action principale (bas droite Bordeaux), retours micro-actions, protection suppression.

### Prompt 8F — Lot B : Palette d'alerte adoucie (05/09/2026, compile OK)
- Statut paiement « en retard » : rouge → **orange doux** ; réponse RSVP « Pas possible » : rouge → gris neutre.
- Variable de thème `--status-error` adoucie (#b3261e → #c2571a orange-rouge) en T1/T2 ; le rouge/bordeaux vif
  reste réservé aux suppressions et refus explicites.
- Reste 8F (lots suivants) : langage constructif systématique, morcellement des formulaires >5 champs,
  autosave brouillons, emplacement fixe de l'action principale, retours micro-actions, protection suppression.

### Prompt 8F — Lot C : Sauvegarde automatique des brouillons (05/09/2026, compile OK)
- Hook réutilisable `lib/useDraft.js` (`useAutoSaveDraft` toutes les 30 s si non vide, `loadDraft`, `clearDraft`,
  expiration silencieuse à 7 jours, stockage localStorage `vdc_draft_*`).
- Câblé sur les commentaires longs (`CommentSection`) : bannière douce « Vous aviez commencé quelque chose —
  voulez-vous reprendre ? » avec Reprendre / Repartir de zéro ; brouillon effacé après publication.
- Réutilisable pour activité/tâche/article (à câbler lors des lots restants).
- Reste 8F : langage constructif systématique, morcellement formulaires >5 champs, emplacement fixe action
  principale, retours micro-actions animés, protection suppression (menu ⋮ + confirmation neutre + traçage).

### Prompt 8F — Lot D : Morcellement, micro-actions & Pomodoro (06/06/2026, testé 100 % frontend — iteration_22)
- **Assistant multi-étapes** réutilisable `FormWizard.jsx` (barre de progression, Précédent/Continuer sans
  perte de données, validation par étape avec message d'aide constructif, action principale toujours **en bas
  à droite en bordeaux**). Appliqué à la **création d'activités** (3 étapes : L'essentiel / Quand & où /
  Détails & options) et d'**événements** (L'essentiel / Dates & lieu / Options & liens).
- **Brouillon auto** câblé sur ces deux formulaires (`useDraft`, clés `activity_new` / `event_new`) : bannière
  de reprise à la réouverture, effacé après création.
- **Retours micro-actions** : pulsation douce (`.vdc-pop`, respecte `data-motion="reduced"`) sur les boutons
  de participation (RSVP) avec mise à jour immédiate des compteurs, sans rechargement.
- **Langage constructif** : messages d'aide formulés en instructions (« Ajoutez un titre pour continuer »),
  suppression des points d'exclamation (ex. bénévolat « Merci, votre proposition… est enregistrée »).
- **Mini-minuteur Pomodoro doux** (`FocusPomodoro`) affiché uniquement en **Mode focus** : 25 min concentration
  / 5 min pause, Démarrer/Pause/Réinitialiser, sans alarme ; synchronisation du mode focus entre composants via
  l'évènement `vdc-focus-changed`.

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
