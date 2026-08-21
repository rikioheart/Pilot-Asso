import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, Chip, SectionCard } from "@/components/Ui";

const SCOPES = { OWN: "Mes actions uniquement", MODULE: "Actions de mes modules", FULL: "Historique complet" };

export default function MyHistory() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/history/me").then((r) => setData(r.data)).catch(() => setData({ items: [] })); }, []);

  if (!data) return <p className="text-muted-foreground" data-testid="history-loading">Chargement…</p>;

  return (
    <div data-testid="history-page">
      <PageHeader breadcrumb="Mon espace" title="Mon historique"
        subtitle="Toutes vos actions restent tracées : c'est la mémoire de votre engagement."
        actions={<Chip tone="marine" testId="history-scope">{SCOPES[data.scope] || data.scope}</Chip>} />

      <SectionCard title="Journal de mes actions" icon={History} testId="history-list">
        {data.items.length === 0 ? (
          <EmptyState testId="history-empty" icon={History} title="Aucune action enregistrée"
            description="Dès votre première contribution, tout apparaîtra ici." />
        ) : (
          <ul className="space-y-3">
            {data.items.map((log) => (
              <li key={log.log_id} className="border-l-2 border-[#800020]/40 pl-3"
                data-testid={`history-item-${log.log_id}`}>
                <p className="text-sm font-semibold text-[#002060]">{log.action} · {log.module}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString("fr-FR")}
                  {log.comment ? ` — ${log.comment}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
