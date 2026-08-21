import { useState } from "react";
import { toast } from "sonner";
import { HandHeart } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/** Bouton « Je propose mon aide » : demande envoyée au Bureau pour validation. */
export const JoinRequestButton = ({ kind = "HELP_OFFER", targetId, targetTitle,
  label = "Je propose mon aide", size = "sm", variant = "outline", testId = "join-request" }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [skills, setSkills] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/join-requests", { kind, target_id: targetId, message, skills });
      toast.success("Merci ! Votre proposition a été transmise au Bureau.");
      setOpen(false); setMessage(""); setSkills("");
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <Button size={size} variant={variant} className="rounded-full" data-testid={`${testId}-button`}
        onClick={() => setOpen(true)}>
        <HandHeart className="mr-1.5 h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid={`${testId}-dialog`}>
          <DialogHeader>
            <DialogTitle>{targetTitle ? `Rejoindre « ${targetTitle} »` : "Proposer mon aide"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Votre message au Bureau</Label>
              <Textarea rows={3} value={message} data-testid={`${testId}-message-input`}
                placeholder="Ce que vous aimeriez faire, vos disponibilités…"
                onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div>
              <Label>Vos savoir-faire (facultatif)</Label>
              <Input value={skills} data-testid={`${testId}-skills-input`}
                placeholder="Ex. photo, bricolage, accueil du public"
                onChange={(e) => setSkills(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Le Bureau reçoit une notification et vous répond directement dans la plateforme.
            </p>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid={`${testId}-send`}>Envoyer ma proposition</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JoinRequestButton;
