import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BellRing, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/Ui";

/** File de priorité du Bureau : tout ce qui demande une action, classé par urgence. */
export const PriorityQueue = ({ data }) => {
  if (!data) return null;
  const high = data.items.filter((i) => i.urgency === "HIGH");
  const normal = data.items.filter((i) => i.urgency === "NORMAL");

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border bg-card" data-testid="priority-queue">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-[var(--marine)] px-5 py-4 text-white">
        <div className="flex items-center gap-2.5">
          <BellRing className="h-5 w-5 text-white/80" />
          <h2 className="font-display text-base md:text-lg font-bold">Ce qui attend une action</h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-[var(--bordeaux)] px-3 py-1" data-testid="priority-high-total">
            {data.high_total} urgent(s)
          </span>
          <span className="rounded-full bg-white/12 px-3 py-1" data-testid="priority-normal-total">
            {data.normal_total} à suivre
          </span>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="p-5">
          <EmptyState testId="priority-empty" icon={CheckCircle2} title="Rien ne bloque, tout est à jour"
            description="Aucune validation, demande ou alerte en attente. Profitez-en pour préparer la suite !" />
        </div>
      ) : (
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {[...high, ...normal].map((item) => (
            <Link key={item.key} to={item.link} data-testid={`priority-${item.key}`}
              className="group flex items-center gap-3 bg-card px-5 py-4 transition-colors hover:bg-muted/60">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl font-display text-lg font-extrabold ${
                item.urgency === "HIGH" ? "bg-[var(--bordeaux-a10)] text-[var(--bordeaux)]" : "bg-[var(--marine-a8)] text-[var(--marine)]"}`}>
                {item.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--marine)]">{item.label}</span>
                {item.urgency === "HIGH" && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--bordeaux)]">
                    <AlertTriangle className="h-3 w-3" /> Action requise
                  </span>
                )}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};

export default PriorityQueue;
