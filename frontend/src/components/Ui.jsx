import { Dog, PawPrint } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useEmptyMessage } from "@/components/EmptyStates";
import { DogEmptyArt } from "@/components/DogEmptyArt";

export const PageHeader = ({ title, subtitle, breadcrumb, actions }) => (
  <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {breadcrumb && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground" data-testid="page-breadcrumb">
          {breadcrumb}
        </p>
      )}
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[var(--marine)]" data-testid="page-title">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {actions}
  </div>
);

export const KpiCard = ({ label, value, hint, icon: Icon, tone = "marine", onClick, testId }) => (
  <button type="button" onClick={onClick} data-testid={testId}
    className="vdc-kpi text-left disabled:cursor-default" disabled={!onClick}>
    <div className="flex items-start justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {Icon && <Icon className={`h-4 w-4 ${tone === "bordeaux" ? "text-[var(--bordeaux)]" : "text-[var(--marine)]"}`} />}
    </div>
    <p className={`mt-3 font-display text-3xl font-extrabold ${tone === "bordeaux" ? "text-[var(--bordeaux)]" : "text-[var(--marine)]"}`}>
      {value}
    </p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </button>
);

export const EmptyState = ({ title, description, action, icon: Icon = PawPrint, testId, module }) => {
  const custom = useEmptyMessage(module);
  const text = custom?.message || description;
  const cta = action || (custom?.action_label && custom?.action_link
    ? <Link to={custom.action_link} data-testid={`${testId || "empty"}-action`}
        className="inline-flex items-center rounded-full bg-[var(--bordeaux)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--bordeaux-dark)]">
        {custom.action_label}
      </Link> : null);
  return (
    <div className="rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center" data-testid={testId}>
      <div className="mx-auto mb-4 h-24 w-24">
        <DogEmptyArt module={module} testId={`${testId || "empty"}-art`} />
      </div>
      <p className="font-display font-bold text-[var(--marine)]">{title}</p>
      {text && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{text}</p>}
      {cta && <div className="mt-5 flex justify-center">{cta}</div>}
    </div>
  );
};

export const SectionCard = ({ title, subtitle, icon: Icon, actions, children, testId, className = "", secondary = false }) => (
  <section className={`rounded-xl border bg-card p-5 ${className}`} data-testid={testId}
    data-focus-secondary={secondary ? "true" : undefined}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-[var(--bordeaux)]" />}
        <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">{title}</h2>
      </div>
      {actions}
    </div>
    {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

export const ProgressBar = ({ value = 0, tone = "bordeaux", label, testId }) => (
  <div data-testid={testId}>
    {label && (
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span><span>{Math.round(value)} %</span>
      </div>
    )}
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full transition-[width] duration-700 ${
        tone === "bordeaux" ? "bg-[var(--bordeaux)]" : "bg-[var(--marine)]"}`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </div>
  </div>
);

export const Chip = ({ children, tone = "muted", testId }) => {
  const tones = {
    muted: "bg-muted text-[var(--marine)]",
    marine: "bg-[var(--marine-a10)] text-[var(--marine)]",
    bordeaux: "bg-[var(--bordeaux-a10)] text-[var(--bordeaux)]",
    green: "bg-emerald-500/10 text-emerald-700",
    amber: "bg-amber-500/15 text-amber-700",
    red: "bg-red-500/10 text-red-700",
  };
  return (
    <span data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
};

/** Bandeau d'accueil chaleureux avec le logo de l'association. */
export const WelcomeBanner = ({ greeting, name, message, coverUrl, badges = [], actions, testId }) => (
  <section data-testid={testId} data-focus-secondary="true"
    className="vdc-grain relative mb-8 overflow-hidden rounded-2xl bg-[var(--marine)] px-5 py-7 text-white sm:px-8 sm:py-9">
    {coverUrl && (
      <img src={coverUrl} alt="" aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-25" />
    )}
    <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[var(--bordeaux-a35)] blur-3xl" />
    <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <Logo size={64} withGlow />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">{greeting}</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight sm:text-3xl lg:text-4xl">
            {name}
          </h1>
          {message && <p className="mt-2 max-w-xl text-sm text-white/75">{message}</p>}
          {badges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span key={badge} data-testid={`welcome-badge-${badge}`}
                  className="inline-flex items-center gap-1 rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/85">
                  <Dog className="h-3 w-3" /> {badge}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  </section>
);
