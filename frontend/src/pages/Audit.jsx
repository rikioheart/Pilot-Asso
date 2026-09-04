import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Audit() {
  const [items, setItems] = useState([]);
  const [module, setModule] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get("/audit", { params: { module: module || undefined, limit: 150 } });
    setItems(data.items);
  }, [module]);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="audit-page">
      <PageHeader breadcrumb="Bureau" title="Journal d'audit"
        subtitle="Qui a fait quoi, sur quoi, quand — avec l'ancienne et la nouvelle valeur." />
      <div className="mb-5 w-full sm:w-64">
        <Label className="text-xs">Module</Label>
        <Input value={module} onChange={(e) => setModule(e.target.value)} placeholder="auth, members, dogs…"
          data-testid="audit-module-filter" />
      </div>
      {items.length === 0 ? (
        <EmptyState testId="audit-empty" title="Aucune entrée" description="Les actions tracées apparaîtront ici." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm" data-testid="audit-table">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3 hidden lg:table-cell">Cible</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.log_id} className="border-t" data-testid={`audit-row-${l.log_id}`}>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3">{l.user_email}</td>
                  <td className="px-4 py-3 font-semibold text-[var(--bordeaux)]">{l.action}</td>
                  <td className="px-4 py-3">{l.module}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{l.target || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
