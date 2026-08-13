export const PageHeader = ({ title, subtitle, breadcrumb, actions }) => (
  <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {breadcrumb && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground" data-testid="page-breadcrumb">
          {breadcrumb}
        </p>
      )}
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#002060]" data-testid="page-title">{title}</h1>
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
      {Icon && <Icon className={`h-4 w-4 ${tone === "bordeaux" ? "text-[#800020]" : "text-[#002060]"}`} />}
    </div>
    <p className={`mt-3 font-display text-3xl font-extrabold ${tone === "bordeaux" ? "text-[#800020]" : "text-[#002060]"}`}>
      {value}
    </p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </button>
);

export const EmptyState = ({ title, description, testId }) => (
  <div className="rounded-xl border border-dashed bg-card/60 p-10 text-center" data-testid={testId}>
    <p className="font-display font-bold text-[#002060]">{title}</p>
    <p className="mt-2 text-sm text-muted-foreground">{description}</p>
  </div>
);
