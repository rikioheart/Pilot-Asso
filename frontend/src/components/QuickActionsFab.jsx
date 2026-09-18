import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, X, Dog, PartyPopper, Sparkle, ClipboardCheck,
  Boxes, BellPlus, ListChecks, QrCode } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { QuickCreatePanel } from "@/components/QuickCreatePanel";
import { CardAccessModal } from "@/components/CardAccessModal";
import { isSoundOn, setSoundOn } from "@/lib/sound";
import { Volume2, VolumeX } from "lucide-react";

const ACTIONS = {
  PARTICULIER: [
    { label: "M'inscrire à une activité", icon: Dog, to: "/activities" },
    { label: "Ma carte", icon: QrCode, card: true },
    { label: "La fiche de mon chien", icon: PartyPopper, to: "/dogs" },
  ],
  PROFESSIONNEL: [
    { label: "Proposer une activité", icon: Sparkle, to: "/activities?new=1", permission: "activities.propose" },
    { label: "Valider une présence", icon: ClipboardCheck, to: "/loyalty/scan", permission: "loyalty.stamp" },
    { label: "Ma carte pro", icon: QrCode, card: true },
    { label: "Noter un retour de séance", icon: ListChecks, to: "/activities" },
  ],
  ADMIN_BUREAU: [
    { label: "Valider une action en attente", icon: ClipboardCheck, to: "/admin/validation" },
    { label: "Saisir un mouvement de stock", icon: Boxes, to: "/stock" },
    { label: "Créer une notification", icon: BellPlus, to: "/admin/members" },
    { label: "Création rapide", icon: Zap, panel: true },
  ],
};

/** Prompt 9 — Bouton d'action rapide flottant, actions urgentes adaptées au rôle. */
export const QuickActionsFab = () => {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [sound, setSound] = useState(isSoundOn());
  const actions = (ACTIONS[user?.role] || []).filter((a) => !a.permission || can(a.permission));
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 lg:bottom-6 lg:right-6"
      data-testid="quick-actions-fab">
      {open && (
        <div className="flex flex-col items-end gap-2" data-testid="quick-actions-menu">
          <button type="button" data-testid="quick-action-sound-toggle"
            onClick={() => { const v = !sound; setSoundOn(v); setSound(v); }}
            className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-[var(--marine)] shadow-lg transition-colors hover:bg-muted">
            {sound ? <VolumeX className="h-4 w-4 text-[var(--bordeaux)]" /> : <Volume2 className="h-4 w-4 text-[var(--bordeaux)]" />}
            {sound ? "Couper le son" : "Activer le son"}
          </button>
          {actions.map((a) => (
            <button key={a.label} type="button" data-testid={`quick-action-${a.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              onClick={() => { setOpen(false); a.panel ? setPanel(true) : a.card ? setCardModal(true) : navigate(a.to); }}
              className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-[var(--marine)] shadow-lg transition-colors hover:bg-muted">
              <a.icon className="h-4 w-4 text-[var(--bordeaux)]" /> {a.label}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen(!open)} data-testid="quick-actions-button"
        aria-label="Actions rapides" aria-expanded={open}
        className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[var(--bordeaux)] text-white shadow-xl transition-colors hover:bg-[var(--bordeaux-dark)]">
        {open ? <X className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
      </button>
      {user?.role === "ADMIN_BUREAU" && <QuickCreatePanel open={panel} onOpenChange={setPanel} />}
      <CardAccessModal open={cardModal} onOpenChange={setCardModal} role={user?.role} />
    </div>
  );
};
