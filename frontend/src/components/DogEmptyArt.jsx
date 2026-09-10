/** Prompt 10 — Illustrations vectorielles légères pour les états vides (personnalité canine). */

const Base = ({ children, testId }) => (
  <svg viewBox="0 0 120 120" role="img" aria-hidden="true" data-testid={testId}
    className="h-full w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="60" cy="60" r="56" fill="var(--sable)" opacity="0.18" />
    {children}
  </svg>
);

// Chien assis qui attend — modules sans données à traiter (tâches, listes…)
const Waiting = () => (
  <g stroke="var(--bordeaux)" strokeWidth="3.2">
    <path d="M45 92 V70 c0-11 30-11 30 0 V92" fill="var(--surface)" />
    <path d="M75 92 c8 0 8-8 0-8" />
    <circle cx="60" cy="52" r="16" fill="var(--surface)" />
    <path d="M46 44 c-6-6-8-14-4-16 4-2 9 3 11 9" fill="var(--surface)" />
    <path d="M74 44 c6-6 8-14 4-16-4-2-9 3-11 9" fill="var(--surface)" />
    <circle cx="54" cy="52" r="2.4" fill="var(--bordeaux)" stroke="none" />
    <circle cx="66" cy="52" r="2.4" fill="var(--bordeaux)" stroke="none" />
    <path d="M60 57 v3 M56 61 h8" />
  </g>
);

// Chien qui joue — modules sans événement
const Playing = () => (
  <g stroke="var(--bordeaux)" strokeWidth="3.2">
    <path d="M40 86 c-6 0-6-9 0-9" fill="var(--surface)" />
    <path d="M44 84 V64 c0-12 34-12 34 4 l6 14" fill="var(--surface)" />
    <circle cx="44" cy="58" r="15" fill="var(--surface)" />
    <path d="M31 52 c-6-5-7-13-3-15 4-2 9 4 10 10" fill="var(--surface)" />
    <path d="M57 52 c6-5 7-13 3-15-4-2-9 4-10 10" fill="var(--surface)" />
    <circle cx="39" cy="58" r="2.2" fill="var(--bordeaux)" stroke="none" />
    <circle cx="49" cy="58" r="2.2" fill="var(--bordeaux)" stroke="none" />
    <circle cx="88" cy="80" r="9" fill="var(--sauge)" stroke="var(--bordeaux)" />
  </g>
);

// Chien qui dort — modules en pause
const Sleeping = () => (
  <g stroke="var(--bordeaux)" strokeWidth="3.2">
    <path d="M30 80 q30-20 60 0 q-30 14-60 0 Z" fill="var(--surface)" />
    <circle cx="36" cy="74" r="11" fill="var(--surface)" />
    <path d="M27 70 c-6-3-8-9-4-11" fill="var(--surface)" />
    <path d="M30 74 q4 3 9 2" />
    <path d="M78 58 q6-6 12 0 M84 52 q4-4 8 0" stroke="var(--sauge)" strokeWidth="2.6" />
  </g>
);

const POSES = { waiting: Waiting, playing: Playing, sleeping: Sleeping };

// Association module → posture
const MODULE_POSE = {
  events: "playing", calendar: "playing", agenda: "playing",
  finance: "sleeping", stock: "sleeping", partners: "sleeping",
};

export const DogEmptyArt = ({ module, pose, className = "", testId = "empty-dog-art" }) => {
  const key = pose || MODULE_POSE[module] || "waiting";
  const Pose = POSES[key] || Waiting;
  return (
    <div className={`mx-auto ${className}`} data-testid={testId} data-pose={key}>
      <Base testId={`${testId}-svg`}><Pose /></Base>
    </div>
  );
};

export default DogEmptyArt;
