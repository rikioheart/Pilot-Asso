import { useEffect, useState } from "react";
import { ChevronRight, X, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const STEPS = {
  ADMIN_BUREAU: [
    ["Votre cockpit", "Le tableau de bord réunit la file de priorité : validations, demandes, alertes de stock et documents à renouveler. Tout est cliquable."],
    ["Piloter les projets", "Créez des projets, découpez-les en tâches, suivez le Kanban et validez les preuves déposées par l'équipe."],
    ["Animer la communauté", "Activités, événements, blog, formations, jeux-concours et avantages adhérents se gèrent depuis la rubrique Communication."],
    ["Gérer & tracer", "Finances, remboursements, parts professionnels, stocks, partenaires et documents officiels : tout est historisé."],
    ["Déléguer et exporter", "Ajustez les droits de chaque profil dans Membres, et exportez vos données en Excel à tout moment."],
  ],
  PROFESSIONNEL: [
    ["Bienvenue dans l'association", "Cet espace regroupe vos missions, vos activités encadrées et les actualités de La Voix du Chien."],
    ["Vos tâches", "Retrouvez vos tâches, déposez une preuve à la fin et le Bureau valide. Chaque contribution est tracée."],
    ["Proposer et encadrer", "Proposez des activités, réservez un terrain et validez les participations avec le scanner de fidélité."],
    ["Vos parts & vos frais", "Consultez les montants qui vous reviennent après chaque activité et demandez vos remboursements."],
    ["Ressources", "Blog, formations, bibliothèque des adhérents et annuaire du réseau sont à votre disposition."],
  ],
  PARTICULIER: [
    ["Bienvenue !", "Ici, vous suivez la vie de l'association, vos inscriptions et vos avantages d'adhérent."],
    ["Participer", "Inscrivez-vous aux balades, ateliers et événements depuis le calendrier en un clic."],
    ["Vos avantages", "Codes promo partenaires, activités offertes, goodies et séances : tout est dans « Mes avantages »."],
    ["Votre fidélité", "Chaque participation donne des points. Présentez votre QR code sur place pour les cumuler."],
    ["Votre profil & vos chiens", "Complétez votre profil et ajoutez vos chiens : cela nous aide à mieux vous accompagner."],
  ],
};

export const Onboarding = () => {
  const { user, profile, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    const seen = profile.onboarding_done || localStorage.getItem(`vdc_onboarding_${user.user_id}`);
    if (!seen) setOpen(true);
  }, [user, profile]);

  const close = async () => {
    setOpen(false);
    localStorage.setItem(`vdc_onboarding_${user.user_id}`, "1");
    try {
      await api.put("/profiles/me", { onboarding_done: true });
      refresh?.();
    } catch { /* le repère local suffit */ }
  };

  if (!open || !user) return null;
  const steps = STEPS[user.role] || STEPS.PARTICULIER;
  const [title, description] = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" data-testid="onboarding-overlay">
      <div className="vdc-grain relative w-full max-w-lg overflow-hidden rounded-2xl bg-card">
        <div className="relative bg-[#002060] px-6 py-7 text-white">
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[#800020]/40 blur-3xl" />
          <button onClick={close} data-testid="onboarding-skip" aria-label="Ignorer la présentation"
            className="absolute right-4 top-4 text-white/60 transition-colors hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <div className="relative flex items-center gap-4">
            <Logo size={56} withGlow />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Étape {step + 1} sur {steps.length}
              </p>
              <h2 className="mt-1 font-display text-xl font-extrabold" data-testid="onboarding-title">{title}</h2>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <p className="text-sm text-muted-foreground" data-testid="onboarding-description">{description}</p>
          <div className="mt-6 flex items-center gap-1.5">
            {steps.map((_, index) => (
              <span key={index} className={`h-1.5 rounded-full transition-all duration-300 ${
                index === step ? "w-8 bg-[#800020]" : "w-3 bg-muted"}`} />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={close} data-testid="onboarding-close"
              className="text-muted-foreground">Ignorer</Button>
            <Button data-testid="onboarding-next" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
              onClick={() => (last ? close() : setStep(step + 1))}>
              {last ? <><Sparkles className="mr-2 h-4 w-4" /> C'est parti !</>
                : <>Suivant <ChevronRight className="ml-1 h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
