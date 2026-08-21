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

## Architecture backend
`server.py` · `deps.py` · `rbac.py` · `storage.py` · `content.py` · `community.py` · `finance.py` ·
`partners.py` · `terrain.py` · `stock.py` · `documents.py` · `exports.py` · `crons_api.py` ·
`profiles_plus.py` · `dogs.py` · `activities.py` (+ taxonomies, participants, présences) · `loyalty.py`
(engagement) · `records.py` (archivage / suppression tracés) · `seed_demo.py` + `seed_phases.py`

## Backlog priorisé

### P0
- **Synchronisation Google Calendar** unidirectionnelle (plateforme → Google), sélection manuelle,
  Bureau vers agenda dédié, pros sur leurs éléments, aucune sync pour les particuliers
  → nécessite l'intégration OAuth Google Calendar (playbook + identifiants)

### P1
- Prompt 7 : intégration Rintintin Pro et déduplication d'agenda (indicateur d'origine déjà en place)
- Statistiques enrichies : indicateurs d'engagement (tampons, paliers atteints) et finances
- Exports PDF des récapitulatifs financiers (en plus d'Excel/CSV)
- Délégation fine des validations à des professionnels de confiance (UI dédiée)

### P2
- Recherche globale étendue aux chiens, partenaires et documents
- Pagination des listes longues (`/api/loyalty/members` : N+1 à optimiser si la base grossit)
- Notifications e-mail individuelles optionnelles par membre
