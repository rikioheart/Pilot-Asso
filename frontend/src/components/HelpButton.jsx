import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

const SKILLS = ["communication", "redaction", "terrain", "logistique", "evenementiel", "informatique",
  "photographie", "prospection", "administratif", "pedagogie", "autre"];

export const HelpButton = ({ compact = false }) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("NEEDS_HELP");
  const [message, setMessage] = useState("");
  const [skills, setSkills] = useState([]);

  const send = async () => {
    if (!message.trim()) return toast.error("Décrivez en une phrase ce dont il s'agit.");
    try {
      await api.post("/help-requests", { type, message, skills });
      toast.success(type === "NEEDS_HELP"
        ? "Message envoyé. Demander de l'aide n'est jamais un échec."
        : "Merci ! Le Bureau a reçu votre proposition d'aide.");
      setOpen(false);
      setMessage("");
      setSkills([]);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggle = (skill) => setSkills(skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? "icon" : "sm"} data-testid="help-button"
          className={compact ? "h-10 w-10 rounded-full border-[#800020]/30" : "rounded-full border-[#800020]/30 text-[#800020]"}
          aria-label="J'ai besoin d'aide">
          <LifeBuoy className={compact ? "h-4 w-4 text-[#800020]" : "mr-2 h-4 w-4"} />
          {!compact && "J'ai besoin d'aide"}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="help-dialog">
        <DialogHeader><DialogTitle>Demander de l'aide, ou en proposer</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[["NEEDS_HELP", "J'ai besoin d'aide"], ["CAN_HELP", "Je peux aider sur…"]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setType(value)} data-testid={`help-type-${value}`}
                className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  type === value ? "border-[#800020] bg-[#800020]/5 font-semibold text-[#800020]" : "hover:border-[#002060]/40"
                }`}>{label}</button>
            ))}
          </div>
          <div className="space-y-2">
            <Label>{type === "NEEDS_HELP" ? "Ce qui vous bloque *" : "Ce que vous pouvez apporter *"}</Label>
            <Textarea rows={4} value={message} data-testid="help-message-input"
              onChange={(e) => setMessage(e.target.value)}
              placeholder={type === "NEEDS_HELP"
                ? "Ex. : je ne sais pas comment contacter la mairie."
                : "Ex. : je peux photographier les événements le week-end."} />
          </div>
          <div className="space-y-2">
            <Label>Domaines concernés</Label>
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.map((s) => (
                <button key={s} type="button" onClick={() => toggle(s)} data-testid={`help-skill-${s}`}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    skills.includes(s) ? "border-[#002060] bg-[#002060] text-white" : "hover:border-[#002060]/40"
                  }`}>{s}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Le Bureau reçoit votre message. Aucune pression : signaler un blocage aide toute l'équipe à avancer.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={send} className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="help-send-button">
            Envoyer au Bureau
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
