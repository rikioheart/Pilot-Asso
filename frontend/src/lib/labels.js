// Libellés français partagés pour les nomenclatures activités / événements.
export const ACTIVITY_CATEGORY_LABELS = {
  BALADE: "Balade", ATELIER: "Atelier", CLASSE_LECTURE: "Classe de lecture",
  JOURNEE_THEME: "Journée à thème", SENSIBILISATION: "Sensibilisation", FORMATION: "Formation",
  RENCONTRE_PRO: "Rencontre professionnelle", PREVENTION: "Prévention", AUTRE: "Autre",
};

export const ACTIVITY_TYPE_LABELS = {
  COLLECTIVE: "Collective", INDIVIDUELLE: "Individuelle", FAMILIALE: "Familiale",
  PRO: "Professionnelle", MIXTE: "Mixte",
};

export const EVENT_TYPE_LABELS = {
  RECURRING: "Récurrent", ONE_OFF: "Ponctuel", THEMED_DAY: "Journée à thème", TRAINING: "Formation",
  PRO_MEETING: "Réunion professionnelle", VISIO: "Visioconférence", INTERVIEW: "Interview",
  LIVE: "Live", PARTNERSHIP_EVENT: "Événement partenaire", OTHER: "Autre",
};

export const VISIBILITY_LABELS = {
  MEMBERS: "Tous les membres", PROFESSIONALS: "Professionnels + Bureau", BUREAU: "Bureau seul",
  PUBLIC: "Public", INTERNAL_ONLY: "Interne uniquement", PROJECT_TEAM: "Équipe projet",
  CUSTOM: "Personnalisée",
};

export const STATUS_LABELS = {
  DRAFT: "Brouillon", PROPOSED: "Proposée", PLANNED: "Planifié", ACTIVE: "En cours", FULL: "Complet",
  CONFIRMED: "Confirmé", DONE: "Terminé", CANCELLED: "Annulé", REFUSED: "Refusé", ARCHIVED: "Archivé",
};

export const ROLE_LABELS = {
  PARTICIPANT: "Participant", VOLUNTEER: "Bénévole", ORGANIZER: "Organisateur",
  PROFESSIONAL: "Professionnel", INTERVENANT: "Intervenant",
};

export const ATTENDANCE_LABELS = {
  UNKNOWN: "Non renseignée", PRESENT: "Présent", ABSENT: "Absent", EXCUSED: "Excusé",
};

export const label = (dictionary, code, custom = {}) =>
  custom[code] || dictionary[code] || (code || "").replaceAll("_", " ");
