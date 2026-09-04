import logo from "@/assets/logo-vdc.png";

/** Logo officiel de l'association, posé sur un médaillon clair pour ressortir sur le marine. */
export const Logo = ({ size = 44, className = "", withGlow = false, testId = "vdc-logo" }) => (
  <span
    data-testid={testId}
    className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-black/5 ${
      withGlow ? "shadow-[0_0_0_6px_rgba(128,0,32,0.12)]" : "shadow-sm"
    } ${className}`}
    style={{ width: size, height: size }}
  >
    <img src={logo} alt="Association La Voix du Chien" className="h-full w-full object-contain p-[6%]" />
  </span>
);

export const LogoLockup = ({ subtitle = "Cockpit interne", size = 44, dark = false }) => (
  <span className="flex items-center gap-3">
    <Logo size={size} withGlow />
    <span className="min-w-0">
      <span className={`block font-display text-sm font-extrabold leading-tight tracking-tight ${
        dark ? "text-[var(--marine)]" : "text-white"}`}>
        LA VOIX DU CHIEN
      </span>
      <span className={`block text-[11px] ${dark ? "text-muted-foreground" : "text-white/55"}`}>{subtitle}</span>
    </span>
  </span>
);

export default Logo;
