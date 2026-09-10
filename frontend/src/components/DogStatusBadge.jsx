import { PawPrint, Bone, Circle } from "lucide-react";

// Prompt 10 — Icônes canines de statut (fiches chiens uniquement), toujours avec le texte.
const MAP = {
  ACTIVE: { icon: PawPrint, label: "Actif", color: "text-emerald-600", dot: "bg-emerald-500" },
  ACTIF: { icon: PawPrint, label: "Actif", color: "text-emerald-600", dot: "bg-emerald-500" },
  PAUSE: { icon: Bone, label: "En pause", color: "text-amber-600", dot: "bg-amber-500" },
  EN_PAUSE: { icon: Bone, label: "En pause", color: "text-amber-600", dot: "bg-amber-500" },
  INACTIVE: { icon: Circle, label: "Inactif", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  INACTIF: { icon: Circle, label: "Inactif", color: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export const dogIconsEnabled = () => localStorage.getItem("vdc_dog_icons") !== "off";

export const DogStatusBadge = ({ status = "ACTIVE", testId = "dog-status" }) => {
  const s = MAP[String(status).toUpperCase()] || MAP.ACTIVE;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" data-testid={testId}
      data-icons={dogIconsEnabled() ? "on" : "off"}>
      {dogIconsEnabled()
        ? <Icon className={`h-3.5 w-3.5 ${s.color}`} data-testid={`${testId}-icon`} />
        : <span className={`h-2 w-2 rounded-full ${s.dot}`} data-testid={`${testId}-dot`} />}
      <span className={s.color}>{s.label}</span>
    </span>
  );
};

export default DogStatusBadge;
