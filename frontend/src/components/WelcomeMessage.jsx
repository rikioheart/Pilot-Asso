import { useMemo } from "react";
import { PawPrint } from "lucide-react";

// Bibliothèque par défaut — lien humain-chien, encouragement, bienveillance, quotidien.
const LIBRARY = [
  "Chaque séance avec votre chien est un pas de plus vers la confiance mutuelle.",
  "La patience que vous apprenez avec votre chien, vous l'offrez aussi aux autres.",
  "Un petit progrès aujourd'hui vaut mieux qu'une grande attente demain.",
  "Votre chien ne juge pas vos jours difficiles — il les traverse avec vous.",
  "Prendre soin d'un chien, c'est réapprendre la douceur du moment présent.",
  "La constance, pas la perfection : c'est ainsi que grandit le lien.",
  "Chaque balade est une conversation sans mots avec votre compagnon.",
  "Observer son chien, c'est déjà commencer à le comprendre.",
  "Le calme que vous cultivez à la maison rejaillit sur tout le groupe.",
  "Un chien heureux commence par un humain apaisé — prenez soin de vous aussi.",
  "Les petites victoires du quotidien construisent de grandes complicités.",
  "Merci d'être là pour votre chien et pour l'association aujourd'hui.",
];

const KEY = "vdc_welcome_last";

const pick = (dogName, empty) => {
  if (empty && dogName) return `${dogName} attend sa première séance — on commence ?`;
  const last = Number(sessionStorage.getItem(KEY) ?? -1);
  let i = Math.floor(Math.random() * LIBRARY.length);
  if (LIBRARY.length > 1 && i === last) i = (i + 1) % LIBRARY.length;
  sessionStorage.setItem(KEY, String(i));
  let msg = LIBRARY[i];
  if (dogName) msg = msg.replace("votre chien", dogName).replace("Votre chien", dogName);
  return msg;
};

/** Prompt 10 — Message d'accueil chaleureux, différent à chaque connexion (jamais 2× de suite). */
export const WelcomeMessage = ({ dogName, empty = false, testId = "welcome-message" }) => {
  const message = useMemo(() => pick(dogName, empty), [dogName, empty]);
  return (
    <div data-testid={testId}
      className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--sable)] bg-[var(--marine-a5)] px-4 py-3">
      <PawPrint className="h-5 w-5 shrink-0 vdc-paw-accent" />
      <p className="text-sm font-medium text-[var(--marine)]">{message}</p>
    </div>
  );
};

export default WelcomeMessage;
