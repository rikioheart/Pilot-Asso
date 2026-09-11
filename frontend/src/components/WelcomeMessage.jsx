import { useMemo } from "react";
import { PawPrint } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const iaWelcomeEnabled = () => localStorage.getItem("vdc_ia_welcome") !== "off";

// Bibliothèque — lien humain-chien, encouragement, bienveillance, quotidien.
const LIBRARY = [
  "chaque séance avec votre chien est un pas de plus vers la confiance mutuelle.",
  "la patience apprise avec votre chien, vous l'offrez aussi aux autres.",
  "un petit progrès aujourd'hui vaut mieux qu'une grande attente demain.",
  "prendre soin d'un chien, c'est réapprendre la douceur du moment présent.",
  "la constance, pas la perfection : c'est ainsi que grandit le lien.",
  "chaque balade est une conversation sans mots avec votre compagnon.",
  "le calme que vous cultivez rejaillit sur tout le groupe.",
  "merci d'être là pour votre chien et pour l'association aujourd'hui.",
];

const greeting = (h) => (h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir");
const season = (m) => (m <= 1 || m === 11 ? "En cette saison d'hiver, "
  : m <= 4 ? "Le printemps arrive, "
    : m <= 7 ? "Profitez de l'été, "
      : "Aux couleurs de l'automne, ");

const build = (firstName, dogName, empty) => {
  const now = new Date();
  const hello = firstName ? `${greeting(now.getHours())} ${firstName}` : greeting(now.getHours());
  if (empty && dogName) return `${hello} — ${dogName} attend sa première séance, on commence ?`;
  const last = Number(sessionStorage.getItem("vdc_welcome_last") ?? -1);
  let i = Math.floor(Math.random() * LIBRARY.length);
  if (LIBRARY.length > 1 && i === last) i = (i + 1) % LIBRARY.length;
  sessionStorage.setItem("vdc_welcome_last", String(i));
  let phrase = LIBRARY[i];
  if (dogName) phrase = phrase.replace("votre chien", dogName);
  const prefix = Math.random() < 0.5 ? season(now.getMonth()) : "";
  return `${hello} — ${prefix}${phrase}`;
};

/** Prompt 10/11 — Message d'accueil contextuel (heure, saison, prénom), différent à chaque session. */
export const WelcomeMessage = ({ dogName, empty = false, testId = "welcome-message" }) => {
  const { profile } = useAuth();
  const firstName = profile?.first_name || null;
  const message = useMemo(() => build(firstName, dogName, empty), [firstName, dogName, empty]);
  if (!iaWelcomeEnabled()) return null;
  return (
    <div data-testid={testId}
      className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--sable)] bg-[var(--marine-a5)] px-4 py-3">
      <PawPrint className="h-5 w-5 shrink-0 vdc-paw-accent" />
      <p className="text-sm font-medium text-[var(--marine)]">{message}</p>
    </div>
  );
};

export default WelcomeMessage;
