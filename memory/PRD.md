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

### Prompt 8G — Accueil minimal, notifications unifiées & activation membres (06/06/2026, testé 100 % frontend — iteration_23)
- **Accueil minimal par rôle** : nouveau composant `BaseHomeBlocks.jsx` (3 blocs communs : progression du chien,
  fil d'actualité, participations à venir). `MemberDashboard` réduit à ces 3 blocs ; `ProDashboard` = 3 blocs +
  « Mes activités du jour » + « Mes tâches du jour ». Modules retirés de l'accueil (toujours accessibles via la nav).
- **Centre de notifications unifié** (`Notifications.jsx`) : filtres Toutes / Prioritaires / Non lues / Archivées,
  badge « Prioritaire » (mentions + validations en attente d'abord via `priority_weight`), tri prioritaire côté API,
  bannière mode vacances. `notify()` (deps.py) étendu : vacances → archivage sans push, digest → `digest_pending`.
- **Digest quotidien** : cron horaire `.emergent/crons.yml` → `/api/cron/hourly` (`send_daily_digests` à l'heure
  choisie par membre via Resend + `expire_vacations`). Bureau toujours en immédiat (non désactivable).
- **Mode vacances** (`account.py`) : suspend/archive les notifications, fin auto à la date choisie ou manuelle,
  Bureau informé, **relais Bureau obligatoire** (409 + désignation d'un remplaçant si aucun autre Bureau actif).
- **Départage validation double** (`activities.py` review) : première décision fait foi ; les autres valideurs
  notifiés « Décision déjà prise » ; le Bureau peut revenir sur une décision d'un PRO_COORDINATEUR sous **48 h**.
- **Parcours d'activation** (`activation.py` + `ActivationJourney.jsx`) : 3–4 étapes (profil, carnet chien,
  1re activité), affiché une fois, passable ; complétion visible du Bureau via `/animation-review` (`activation_done`).
- **Désactivation & suppression RGPD** (`account.py` + `AccountSettings.jsx`, onglet « Notifications & compte » de
  Mon espace) : désactivation réversible (profil masqué de l'annuaire, données conservées) ; suppression
  irréversible avec double confirmation (saisie « SUPPRIMER »), effacement des données perso, conservation des
  données comptables anonymisées ; Bureau notifié dans les deux cas.
- Backfill : `priority_weight` ajouté aux 212 notifications existantes.

### Prompt 9 — Organisation, navigation & outils (07/06/2026, testé 100 % frontend — iteration_24)
- **Outils externes** (`tools.py` + `ExternalTools.jsx`) : section « Outils externes » configurée par le Bureau
  (ajout/retrait, ⋮), visible par tous, présente sur les 3 dashboards et via le FAB (ancre `#outils`).
- **Liens externes sur tâches & projets** (`tools.py` `/{tasks|projets}/{id}/links` + `ExternalLinks.jsx`) :
  ajout manuel de plusieurs liens (Drive, Forms, Canva, Rintintin Pro…), affichés dans le contexte, retrait via ⋮,
  ouverture en nouvel onglet. Intégrés dans `ProjectDetail` (projet + chaque tâche).
- **Raccourcis dashboard par rôle** (`DashboardShortcuts.jsx`) : « Accès rapides » (Bureau : tâches/projets,
  activités, membres, finances, animation ; Pro : tâches, activités, projets ; Particulier : activités, chien,
  fidélité) + « Autour du chien » (7 tuiles : éducation, collective, sport, photo, vétérinaire, visio, réunion)
  mappées sur les catégories d'activités/événements existantes.
- **Bouton flottant « + » enrichi par rôle** (`QuickActionsFab.jsx`) : Bureau (valider en attente · mouvement de
  stock · créer notification · création rapide en panneau latéral) ; Pro (proposer activité · valider présence ·
  retour de séance) ; Particulier (s'inscrire · carte fidélité · fiche chien) + accès « Outils externes ».
- Rappel : panneaux latéraux (Sheet/QuickCreatePanel), recherche globale, guides, cotisations par catégorie,
  vue animation et description de fonction préexistaient et sont réutilisés. Réorganisation profonde de la barre
  de navigation et filtres avancés de recherche : **différés** (P2) pour éviter les régressions.

### Prompt 9 (suite) — Nav réorganisée, recherche filtrée, retour 48 h, taxonomie chien (08/06/2026, testé 100 % — iteration_25)
- **Navigation par fréquence** (`AppShell.jsx`) : liens directs de premier niveau par rôle (Bureau : Activités,
  Tâches, Validation, Membres, Finances ; Pro : Mes tâches, Activités, Participations ; Particulier : Activités,
  Mon chien, Ma fidélité), modules secondaires regroupés en sections dépliables. Filtrage permission/bloc des
  liens directs ; barre mobile basée sur les liens directs.
- **Recherche filtrée** (`GlobalSearch.jsx`) : puces « Tout » + une par groupe de résultats, résultats actionnables.
- **Retour Bureau 48 h** (`Activities.jsx`) : bouton « Revenir sur la décision » visible pour le Bureau sur les
  activités validées par un PRO_COORDINATEUR dans les 48 h → rouvre Accepter/Refuser (override géré côté back).
- **Taxonomie chien** : nouvelles catégories `EDUCATION`, `SPORT`, `PHOTO`, `VETERINAIRE` (`activities.py` +
  `labels.js`) ; raccourcis « Autour du chien » filtrant exactement via `?category=`/`?type=` (Activities/Events
  lisent l'URL, puce de type retirable).
- Fix (agent de test) : `slug()` normalise les accents (NFD) dans AppShell/DashboardShortcuts/GlobalSearch.

### Connexion Google Drive & pagination fidélité (09/06/2026, testé 100 % — iteration_26)
- **Connexion Google Drive (sans OAuth)** : `tools.py` — `/drive/resources` CRUD (Bureau) pour lier dossiers/
  documents partagés (collection `drive_resources`), lecture pour tous ; liens Drive spécifiques sur tâches et
  projets via `/{kind}/{id}/links?channel=drive` stockés dans `drive_links` (distincts des `external_links`).
  Frontend : `DriveResources.jsx` (config dans AdminSettings + carte lecture dans ProjectDetail), `ExternalLinks`
  gagne `variant="drive"` (bouton « Ouvrir dans Drive »), liens Drive sur projet + chaque tâche.
- **Pagination fidélité** : `/loyalty/members` réécrit en **pagination par décalage** (skip/limit, 50 max/page)
  avec `total`/`pages`, filtres **statut / niveau min. (tampons) / activité récente 30 j appliqués AVANT** la
  pagination (plus de chargement complet en mémoire). `Engagement.jsx` : barre de filtres + compteur + contrôles
  Précédent/Suivant « Page X / Y » (affichés dès que pages > 1).
- Note : route `/projects` protégée pour le Particulier (comportement voulu) — la carte Drive lecture côté membre
  se vérifie via d'autres pages.

### Prompt 10 — Personnalité vivante & identité canine (10/06/2026)
- **Lot 1 — Charte étendue & états vides canins** (testé 100 % — iteration_27) : ajout Gris Anthracite (texte
  clair adouci + `.vdc-surface-alt`), Sable Chaud & Vert Sauge **décoratifs uniquement** (`.vdc-decor-*`,
  `.vdc-divider`, `.vdc-dot` ; jamais boutons/statuts). Thème sombre (T3) retravaillé (fonds/bordures/muted plus
  harmonieux, bordeaux adouci). Illustrations SVG légères `DogEmptyArt` (chien attend/joue/dort selon module)
  intégrées à `EmptyState`.
- **Lot 2 — Présence du chien** (testé 100 % — iteration_28) : `DogAvatar` (photo ou silhouette + pop-up survol :
  photo agrandie, race, âge, Pro référent), intégré aux cartes chien du dashboard.
- **Lot 3 — Messages d'accueil dynamiques** (testé 100 % — iteration_28) : `WelcomeMessage` (bibliothèque FR par
  défaut, rotation sans répétition consécutive, encouragement si dashboard vide), sur dashboards membre/pro/bureau.
- **Lot 4 — Son d'ambiance optionnel** (frontend, compile OK) : `lib/sound.js` (Web Audio synthétique, aucun asset,
  respecte le silence système), **désactivé par défaut**, interrupteur dans « Notifications & compte » + bascule
  depuis le FAB « + » ; sons câblés sur création d'activité/événement et validation de tampon (badge).
- **Lot 5 — Finitions visuelles** (partiel, testé 100 % — iteration_29) : **icônes canines de statut** sur les
  fiches chiens (`DogStatusBadge` : patte/os/cercle, vert/orange/gris, toujours avec le texte, désactivable
  utilisateur → pastille simple) ; **effet Ken Burns** sur la couverture (`.vdc-kenburns`, respecte
  prefers-reduced-motion / `data-motion="reduced"`, désactivable utilisateur) ; **aperçu son** (`chime(type, force)`)
  + carte « Confort visuel » dans « Notifications & compte ».
- **Reste à faire (P1)** : galerie d'activités sur la page publique (mosaïque, défilement au clic, config/ordre
  Bureau, compression upload) ; galerie d'icônes de statut choisie par le Bureau + toggle Ken Burns au niveau
  association ; diffusion `DogAvatar` aux notifications/commentaires/fil ; gestion Bureau des messages d'accueil ;
  désactivation par module des illustrations d'états vides ; mise à jour live des préférences (évènement partagé)
  au lieu d'un rechargement.

### Prompt 11 — IA douce & libellés configurables (10/06/2026)
- **Fonction 4 — Message d'accueil contextuel** (testé 100 % — iteration_30) : `WelcomeMessage` enrichi (heure →
  Bonjour/Bon après-midi/Bonsoir, saison, **prénom** via `useAuth().profile.first_name`), varie à chaque session,
  masqué si préférence désactivée. Sur dashboards membre/pro/bureau.
- **Centre « IA douce & messages »** (testé 100 %) : carte dans « Notifications & compte » avec 3 interrupteurs
  (message d'accueil `vdc_ia_welcome`, suggestions carnet `vdc_ia_suggest`, relance douce `vdc_ia_relance`),
  **activés par défaut**, par utilisateur (localStorage). Couvre l'exigence activable/désactivable des fonctions 2/3/4.
- **Fonction 1 — Libellés de navigation configurables** (testé 100 % — iteration_31) : `tools.py`
  `GET/PUT /api/nav-labels` (Bureau) stockés dans `app_settings` (map libellé d'origine → nouveau) ;
  `lib/useNavLabels.js` (cache + listeners, application immédiate) ; `AppShell` mappe les libellés d'onglets et
  de catégories ; interface `NavLabelsSettings` dans les Réglages de l'association. Défauts = valeurs actuelles.
- **Fonction 2 — Suggestions douces dans le carnet** (testé 100 % — iteration_32) : `DogJournal` affiche une
  bulle légère ignorable (`journal-suggestion`) déclenchée à l'enregistrement d'une entrée **ou après 10 s
  d'inactivité** de frappe ; suggestions constructives (définir un objectif, ajouter une photo, préciser une
  note courte, encouragement au suivi régulier). Respecte la préférence `vdc_ia_suggest` ; une suggestion
  ignorée ne réapparaît pas dans la session.
- **Fonction 3 — Détection de décrochage & relance douce** (testé 100 % backend curl + frontend iteration_32) :
  `server.py` `compute_relance()`/`record_login()` — au login (mot de passe **et** Google), si > 21 j sans
  connexion, compte établi (> 21 j) et pas de relance dans les 30 derniers jours, la réponse renvoie
  `relance:{days}` ; `previous_login` et `relance_shown_at` tracés. `AuthContext.applySession` stocke la relance
  en sessionStorage ; `RelanceWelcome` affiche une bannière chaleureuse ignorable **une seule fois** sur les
  dashboards membre/pro/bureau, respectant `vdc_ia_relance`.
- **Reste à faire (P1)** :
  - Migration éventuelle des préférences IA (`vdc_ia_*`) vers `/account/settings` (sync multi-appareils).

### Correctifs & test exhaustif profils PARTICULIER (12/09/2026, testé 100 % — iterations 33-35)
- **Correctif crash `Profile.jsx`** : `/api/dogs` renvoie `{items:[...]}` ; `setDogs` lit `r.data.items` et le
  rendu de la liste des chiens est gardé par `Array.isArray(dogs)?dogs:[]` (plus de crash sur l'onglet
  « Mes chiens »). `addDog` sécurisé de même.
- **Carnet — suppression par le propriétaire** (`DogJournal.jsx`) : l'auteur propriétaire peut désormais
  supprimer **son propre objectif** (bouton `journal-del-*` visible pour `is_owner && by_owner`), aligné sur le
  backend ; les boutons +1/−1 séance restent réservés au Bureau/Pro.
- **Édition d'une fiche chien** (`Dogs.jsx`) : bouton « Modifier la fiche » (`dog-edit-button`) dans le détail,
  réutilise le formulaire (pré-rempli) en mode édition → `PUT /api/dogs/{id}` (nom, race, âge, sexe, photo,
  catégorie, contexte, historique) ; persistance vérifiée. Création inchangée.
- **Test exhaustif PARTICULIER (A→M)** : compte/profil, onboarding/activation, CRUD chiens, carnet + suggestions
  IA, dashboard, navigation par rôle (aucun onglet Pro/Bureau visible), activités/événements (inscription/
  désinscription), notifications (lu/tout lu), fidélité, préférences IA — tous OK. `/finances` redirige vers le
  dashboard pour `PARTICULIER_STANDARD` (comportement produit).
- **Doc** : `test_credentials.md` réaligné sur le seed réel (membre1 = `PARTICULIER_STANDARD`, `membre2.demo`
  n'existe pas) ; nettoyage des chiens de test `TEST_*` résiduels.

### Chiens personnels des professionnels & suppression de fiche (14/09/2026, testé 100 % — iteration_37)
- **Onglet « Mes chiens » pour les PROFESSIONNEL** (`Profile.jsx`) : identique aux PARTICULIER (liste, création,
  suppression), indépendant du rôle pro. Le profil récupère ses chiens via `GET /api/dogs?owner_id=<self>`.
- **Backend `dogs.py`** : `list_dogs` renvoie les chiens **possédés** dès que `owner_id == self` (tous rôles) ;
  `can_create = True` pour tous ; **nouvelle route `DELETE /api/dogs/{id}`** (propriétaire ou Bureau) avec
  nettoyage en cascade (carnet, cas, étapes, comptes-rendus, commentaires, notes) — corrige le 404 qui touchait
  aussi les PARTICULIER.
- **Isolation** : la page « Chiens suivis » (`/dogs`, référent/équipe) reste **inchangée** — les chiens
  personnels d'un pro n'y apparaissent pas.
- Compte de démo **PRO_AVANCE** ajouté au seed (`pro3.demo@lavoixduchien.fr`).
- Navigation pro enrichie (`AppShell.jsx`) : liens **Mindmap**, **Statistiques** (coordinateur, `stats.view`) et
  **Documents** ajoutés au menu latéral PROFESSIONNEL (routes/permissions déjà existantes).

### Consolidation Bureau — permissions configurables (14/09/2026, testé 100 % — iteration_39)
- **Matrice des permissions modifiable** (`RbacMatrixSettings.jsx` dans Réglages) : le Bureau choisit les
  permissions de chaque niveau ; `rbac.RUNTIME_LEVEL_PERMISSIONS` + `set/reset_level_permissions`, persistée en
  base (`app_settings/rbac_matrix`), rechargée au démarrage, appliquée immédiatement à `effective_permissions`.
  Endpoints `GET/PUT /api/settings/rbac` (+ `default_permissions`) et `POST /api/settings/rbac/reset`.
- **Permissions individuelles par membre** (dialogue d'édition dans Membres) : boutons Accorder/Révoquer par
  permission (baseline « inclus » selon le niveau), enregistrés via `PUT /members/{id}` `granted`/`revoked`
  (déjà supporté côté backend). Persistance et effet vérifiés.
- Vérifié déjà en place (aucune modification) : `DELETE /api/dogs/{id}` (403 si ni propriétaire ni Bureau),
  contrôle de rôle `create_dog` (PRO → soi-même uniquement), libellés de navigation configurables (Prompt 11 F1),
  Prompt 11 IA (suggestions carnet, détection décrochage, message d'accueil — activables par utilisateur).

### Prompt 12 — Objectifs/progression + Pilotage & correctif coordinateur (14/09/2026, testé 100 % — iter 40-41)
- **Objectifs et progression** (fiche chien) : collection dédiée `dog_objectives` (intitulé, statut EN_COURS/
  ATTEINT/ABANDONNE, dates début/atteinte, notes, `status_history`, `session_reports` avec réactions du
  propriétaire, `owner_notes`). Endpoints `GET/POST /dogs/{id}/objectives`, `PUT .../{oid}`,
  `POST .../notes` (propriétaire), `POST .../reports` (pro), `POST .../reports/{rid}/react`. Pro rattaché/Bureau
  éditent ; propriétaire lecture seule + notes + réactions. Composant `DogObjectives.jsx`.
- **Pilotage** (`Pilotage.jsx`, `/pilotage`) : `GET /api/pilotage` (ADMIN_BUREAU + PRO_COORDINATEUR only).
  Chiens en suivi actif (statut ≠ ARCHIVED), dernière intervention (reports/steps/séances), mise en évidence
  > 21 j, badge multi-pros, 3 compteurs (actifs / objectifs en cours / atteints ce mois). Lignes cliquables →
  `/dogs?open=<id>` (auto-ouverture de la fiche). Lecture seule.
- **Correctif** : `dog_access()` autorise désormais la LECTURE au PRO_COORDINATEUR (écritures toujours bloquées) ;
  `Dogs.jsx openDetail` encapsulé dans try/catch (toast FR) — supprime l'overlay « Uncaught runtime errors »
  lors du clic Pilotage→fiche sur un chien hors équipe.
- **Test BUREAU/ADMIN** : un seul sous-type existe (`ADMIN_BUREAU`/`BUREAU`). Régression 100 % (29 routes,
  13 sous-cartes Réglages, membres, matrice RBAC, overrides permissions, RBAC négatif pro1). Points non
  bloquants : bursts 429 uniquement sous navigation automatisée très rapide (rate-limit ingress, pas applicatif) ;
  « galerie photo générale » = fonctionnalité dédiée non encore construite (distincte de la Photo de couverture).

### Accès rapide QR plein écran + carte pro (14/09/2026, testé 100 % — iteration_42)
- **Plein écran QR** (`FullscreenQR.jsx`, API Fullscreen + overlay fixe) : carte de fidélité (`/loyalty`,
  bouton `loyalty-fullscreen-button`, protégé `loyalty.view_own`) et carte de visite pro (`ProCardQr`,
  bouton `pro-card-qr-fullscreen`) — QR agrandi centré, nom + sous-titre, bouton discret pour quitter.
- **Accès rapide unifié** (`CardAccessModal.jsx`) dans le FAB (`QuickActionsFab`) et les raccourcis
  (`DashboardShortcuts`) : « Ma carte » (PARTICULIER → fidélité / plein écran via `/loyalty?fullscreen=1`) et
  « Ma carte pro » (PROFESSIONNEL → fiche pro / plein écran via `/profile?tab=pro&fullscreen=procard`). Accès
  existants conservés.
- **Fiche publique enrichie** (`PublicProCard.jsx`) : site internet + icônes réseaux sociaux (LinkedIn/Facebook/
  Instagram, sinon Globe), éditables depuis `/profile` (champs `pro-social-*`, `pro-website-input`) ; section
  masquée si aucun lien.

### Partage carte pro + QR fidélité haute lisibilité (16/09/2026, vérifié screenshot)
- **Bouton « Partager »** (`ProCardQr.jsx`, `pro-card-qr-share`) : Web Share API native (fiche publique
  `/carte/{userId}`), repli copie-lien si l'API n'est pas disponible.
- **Plein écran haute lisibilité** (`FullscreenQR.jsx`) : fond noir pur, QR noir/blanc contraste maximal
  (level H) + astuce « augmentez la luminosité » — scan plus fiable en extérieur.

### Tableau de bord hiérarchisé + tokens d'espacement (18/09/2026, testé 100 % — iteration_43)
- **Restructuration dashboards uniquement** : blocs prioritaires au chargement, informations secondaires
  (ExternalTools) repliées dans un panneau `SecondaryPanel` (« Informations complémentaires », `dashboard-secondary`).
  Composants existants réutilisés ; aucun code de bloc supprimé.
- **Persistance** : `GET /api/dashboard/layout` (défaut par rôle + préférence utilisateur), `PUT /api/account/dashboard`
  (préférence perso en base `preferences.dashboard_secondary_open`), `GET/PUT /api/settings/dashboard`
  (Bureau, défauts par rôle dans `app_settings/dashboard_secondary`). Endpoints placés AVANT `include_router`.
- **Config Bureau** : carte `DashboardBlocksSettings` dans Réglages (switch par rôle). Non-admins → 403.
- **Tokens Tailwind** (`tailwind.config.js`) : `spacing` card/section/field/list, `lineHeight.content` (1.7),
  `fontSize.label` (0.875rem). `SectionCard` applique `p-card` + `text-label` + `leading-content`.

### Cohérence des actions, accès Pilotage & lien site public (18/09/2026, testé 100 % frontend — iteration_44)
- **Charge cognitive des actions réduite** (ton constructif, aucune fonctionnalité modifiée) : une seule action primaire par ligne, le reste dans un menu `⋮` réutilisant `RowMenu` (shadcn DropdownMenu) — appliqué à Membres (Valider/Réactiver/Rôle + menu Refuser/Suspendre/Rôle), Activités (inscription primaire + menu Discussion/Accepter/Refuser/Revenir), Événements (inscription primaire + menu Être bénévole/Voir les détails), Tâches de projet (1 action contextuelle Valider/Terminer/Commencer/Je m'en occupe + menu Commenter/Aide/Historique/Supprimer). Bouton **Annuler** du dialogue Membres passé en **bouton plein secondaire** (`variant="secondary"`).
- **QuickActionsFab épuré** : création rapide en accès direct + 4 actions max par rôle, doublons avec la nav retirés (plus de « Outils externes » ni « Ma fiche »).
- **Accès Pilotage aligné front↔back** : le lien nav et la route `/pilotage` ne s'affichent/n'autorisent que si `role === ADMIN_BUREAU` **ou** `access_level === PRO_COORDINATEUR` (flag `coordinatorOnly` en nav, prop `coordinatorOrAdmin` sur `Protected`) — suppression de la dépendance à `stats.view` pour ce cas (les autres usages de `stats.view` inchangés). Corrige le 403 pour un PRO_AVANCE à qui le Bureau aurait accordé `stats.view`.
- **Lien « Découvrir l'association » sur /login** : champ `website_url` configurable par le Bureau dans les Réglages (`PublicPageSettings`, endpoint existant `PUT /settings/public-page`, normalisé en `https://`), exposé publiquement par `GET /api/public/page` ; lien discret affiché sous le formulaire uniquement si l'URL est renseignée (ouverture en nouvel onglet).

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
