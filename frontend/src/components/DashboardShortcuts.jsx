import { useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Sparkle, Users, Dog, GraduationCap, Trophy, Camera, Stethoscope,
  Video, CalendarDays, ClipboardList, Wallet, QrCode } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SectionCard } from "@/components/Ui";
import { CardAccessModal } from "@/components/CardAccessModal";

// Raccourcis « activités autour du chien » mappés sur les catégories d'activités existantes.
const DOG_SHORTCUTS = [
  { label: "Éducation", icon: GraduationCap, to: "/activities?category=EDUCATION" },
  { label: "Collective", icon: Users, to: "/activities?type=COLLECTIVE" },
  { label: "Sport", icon: Trophy, to: "/activities?category=SPORT" },
  { label: "Photo", icon: Camera, to: "/activities?category=PHOTO" },
  { label: "Vétérinaire", icon: Stethoscope, to: "/activities?category=VETERINAIRE" },
  { label: "Visio", icon: Video, to: "/events?type=VISIO" },
  { label: "Réunion", icon: CalendarDays, to: "/events?type=PRO_MEETING" },
];

const ROLE_SHORTCUTS = {
  ADMIN_BUREAU: [
    { label: "Tâches & projets", icon: FolderKanban, to: "/projects" },
    { label: "Activités", icon: Sparkle, to: "/activities" },
    { label: "Membres", icon: Users, to: "/admin/members" },
    { label: "Finances", icon: Wallet, to: "/finance" },
    { label: "Animation", icon: ClipboardList, to: "/admin/animation" },
  ],
  PROFESSIONNEL: [
    { label: "Mes tâches", icon: ClipboardList, to: "/tasks" },
    { label: "Activités", icon: Sparkle, to: "/activities" },
    { label: "Projets", icon: FolderKanban, to: "/projects" },
  ],
  PARTICULIER: [
    { label: "Activités", icon: Sparkle, to: "/activities" },
    { label: "Mon chien", icon: Dog, to: "/dogs" },
    { label: "Ma fidélité", icon: Trophy, to: "/loyalty" },
  ],
};

const Tile = ({ item }) => (
  <Link to={item.to} data-testid={`shortcut-${item.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
    className="flex flex-col items-center gap-2 rounded-xl border bg-card px-3 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--bordeaux-a40)] hover:shadow-md">
    <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--marine-a8)] text-[var(--bordeaux)]">
      <item.icon className="h-5 w-5" />
    </span>
    <span className="text-xs font-semibold text-[var(--marine)]">{item.label}</span>
  </Link>
);

/** Prompt 9 — Raccourcis visuels par rôle, accessibles dès la connexion. */
export const DashboardShortcuts = () => {
  const { user } = useAuth();
  const [cardModal, setCardModal] = useState(false);
  const shortcuts = ROLE_SHORTCUTS[user?.role] || [];
  const showDog = user?.role !== "ADMIN_BUREAU";
  const cardLabel = user?.role === "PROFESSIONNEL" ? "Ma carte pro" : "Ma carte";

  return (
    <div className="space-y-6" data-testid="dashboard-shortcuts">
      <SectionCard title="Accès rapides" testId="shortcuts-role">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {shortcuts.map((s) => <Tile key={s.label} item={s} />)}
          {user?.role !== "ADMIN_BUREAU" && (
            <button type="button" onClick={() => setCardModal(true)} data-testid="shortcut-ma-carte"
              className="flex flex-col items-center gap-2 rounded-xl border bg-card px-3 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--bordeaux-a40)] hover:shadow-md">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--marine-a8)] text-[var(--bordeaux)]">
                <QrCode className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold text-[var(--marine)]">{cardLabel}</span>
            </button>
          )}
        </div>
      </SectionCard>
      {showDog && (
        <SectionCard title="Autour du chien" icon={Dog} testId="shortcuts-dog"
          subtitle="Éducation, collective, sport, photo, vétérinaire, visio, réunion.">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {DOG_SHORTCUTS.map((s) => <Tile key={s.label} item={s} />)}
          </div>
        </SectionCard>
      )}
      <CardAccessModal open={cardModal} onOpenChange={setCardModal} role={user?.role} />
    </div>
  );
};

export default DashboardShortcuts;
