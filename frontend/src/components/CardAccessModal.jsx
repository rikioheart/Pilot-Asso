import { useNavigate } from "react-router-dom";
import { Trophy, Maximize2, UserCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const Choice = ({ icon: Icon, label, onClick, testId }) => (
  <Button type="button" variant="outline" onClick={onClick} data-testid={testId}
    className="h-auto justify-start gap-3 rounded-xl px-4 py-4 text-left">
    <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--marine-a8)] text-[var(--bordeaux)]">
      <Icon className="h-5 w-5" />
    </span>
    <span className="font-semibold text-[var(--marine)]">{label}</span>
  </Button>
);

/** Accès rapide unifié à la carte (fidélité PARTICULIER / carte pro PROFESSIONNEL). */
export const CardAccessModal = ({ open, onOpenChange, role }) => {
  const navigate = useNavigate();
  const go = (to) => { onOpenChange(false); navigate(to); };
  const isPro = role === "PROFESSIONNEL";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="card-access-modal">
        <DialogHeader>
          <DialogTitle>{isPro ? "Ma carte pro" : "Ma carte"}</DialogTitle>
          <DialogDescription>Choisissez ce que vous souhaitez afficher.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {isPro ? (
            <>
              <Choice icon={UserCircle} label="Ma fiche professionnelle"
                testId="card-access-pro-fiche" onClick={() => go("/profile?tab=pro")} />
              <Choice icon={Maximize2} label="Afficher mon profil en plein écran"
                testId="card-access-pro-fullscreen" onClick={() => go("/profile?tab=pro&fullscreen=procard")} />
            </>
          ) : (
            <>
              <Choice icon={Trophy} label="Ma carte de fidélité"
                testId="card-access-loyalty" onClick={() => go("/loyalty")} />
              <Choice icon={Maximize2} label="Afficher ma carte en plein écran"
                testId="card-access-loyalty-fullscreen" onClick={() => go("/loyalty?fullscreen=1")} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CardAccessModal;
