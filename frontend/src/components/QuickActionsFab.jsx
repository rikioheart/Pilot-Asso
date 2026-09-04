import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, X, Dog, PartyPopper, Sparkle, UserCircle, UserPlus, LayoutDashboard, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { QuickCreatePanel } from "@/components/QuickCreatePanel";

const ACTIONS = {
  PARTICULIER: [
    { label: "Inscrire mon chien à une activité", icon: Dog, to: "/activities" },
    { label: "Consulter le prochain événement", icon: PartyPopper, to: "/events?next=1" },
  ],
  PROFESSIONNEL: [
    { label: "Créer une activité", icon: Sparkle, to: "/activities?new=1", permission: "activities.propose" },
    { label: "Accéder à ma fiche", icon: UserCircle, to: "/profile" },
  ],
  ADMIN_BUREAU: [
    { label: "Créer un membre", icon: UserPlus, to: "/admin/members?new=1" },
    { label: "Consulter le cockpit", icon: LayoutDashboard, to: "/admin/dashboard" },
    { label: "Création rapide", icon: Plus, panel: true },
  ],
};

/** Bouton d'action rapide flottant, adapté au rôle connecté. */
export const QuickActionsFab = () => {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  const actions = (ACTIONS[user?.role] || []).filter((a) => !a.permission || can(a.permission));
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 lg:bottom-6 lg:right-6"
      data-testid="quick-actions-fab">
      {open && (
        <div className="flex flex-col items-end gap-2" data-testid="quick-actions-menu">
          {actions.map((a) => (
            <button key={a.label} type="button" data-testid={`quick-action-${a.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              onClick={() => { setOpen(false); a.panel ? setPanel(true) : navigate(a.to); }}
              className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-[var(--marine)] shadow-lg transition-colors hover:bg-muted">
              <a.icon className="h-4 w-4 text-[var(--bordeaux)]" /> {a.label}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen(!open)} data-testid="quick-actions-button"
        aria-label="Actions rapides" aria-expanded={open}
        className="grid h-13 w-13 h-[52px] w-[52px] place-items-center rounded-full bg-[var(--bordeaux)] text-white shadow-xl transition-colors hover:bg-[var(--bordeaux-dark)]">
        {open ? <X className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
      </button>
      {user?.role === "ADMIN_BUREAU" && <QuickCreatePanel open={panel} onOpenChange={setPanel} />}
    </div>
  );
};
