import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Ui";

export default function AdminSettings() {
  const [matrix, setMatrix] = useState(null);

  useEffect(() => {
    api.get("/settings/rbac").then((r) => setMatrix(r.data)).catch(() => setMatrix(false));
  }, []);

  return (
    <div data-testid="admin-settings-page">
      <PageHeader breadcrumb="Bureau" title="Administration"
        subtitle="Rôles, niveaux et permissions. La vérification est toujours effectuée côté serveur." />
      {!matrix ? <p className="text-muted-foreground">Chargement…</p> : (
        <div className="space-y-6">
          {Object.entries(matrix.levels_by_role).map(([role, levels]) => (
            <div key={role} className="rounded-xl border bg-card p-5" data-testid={`rbac-role-${role}`}>
              <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">{role}</h2>
              <div className="mt-4 space-y-4">
                {levels.map((lvl) => (
                  <div key={lvl}>
                    <p className="text-sm font-semibold text-[#800020]">{lvl}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {role === "ADMIN_BUREAU" ? (
                        <span className="rounded-full bg-[#800020]/10 px-3 py-1 text-xs font-semibold text-[#800020]">
                          Toutes les permissions ({matrix.permissions.length})
                        </span>
                      ) : (
                        (matrix.level_permissions[lvl] || []).map((p) => (
                          <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-xs">{p}</span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-dashed bg-card/60 p-5 text-sm text-muted-foreground">
            Import CSV, catégories, types d'événements, règles de fidélité et exports arrivent dans les phases suivantes.
          </div>
        </div>
      )}
    </div>
  );
}
