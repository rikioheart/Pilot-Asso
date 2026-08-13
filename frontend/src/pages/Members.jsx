import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_STYLE = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-red-50 text-red-700",
  REJECTED: "bg-red-50 text-red-700",
  ARCHIVED: "bg-muted text-muted-foreground",
};

const LEVELS = {
  ADMIN_BUREAU: ["BUREAU"],
  PROFESSIONNEL: ["PRO_STANDARD", "PRO_AVANCE", "PRO_COORDINATEUR"],
  PARTICULIER: ["PARTICULIER_STANDARD", "PARTICULIER_IMPLIQUE", "BENEVOLE_VALIDE", "REFERENT_BENEVOLE"],
};

export default function Members() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const status = params.get("status") || "";
  const role = params.get("role") || "";

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/members", { params: { status: status || undefined, role: role || undefined, q: q || undefined, limit: 100 } });
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [status, role, q]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  const update = async (userId, payload, message) => {
    try {
      await api.put(`/members/${userId}`, payload);
      toast.success(message);
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="members-page">
      <PageHeader breadcrumb="Bureau" title="Membres"
        subtitle="Validez les adhésions, ajustez les rôles, les niveaux d'implication et les permissions." />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Label className="text-xs">Recherche</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou e-mail" data-testid="members-search-input" />
        </div>
        <div>
          <Label className="text-xs">Statut</Label>
          <Select value={status || "ALL"} onValueChange={(v) => setFilter("status", v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-44" data-testid="members-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["ALL", "PENDING", "ACTIVE", "SUSPENDED", "REJECTED", "ARCHIVED"].map((s) => (
                <SelectItem key={s} value={s} data-testid={`members-status-option-${s}`}>{s === "ALL" ? "Tous" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Rôle</Label>
          <Select value={role || "ALL"} onValueChange={(v) => setFilter("role", v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-52" data-testid="members-role-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["ALL", "ADMIN_BUREAU", "PROFESSIONNEL", "PARTICULIER"].map((r) => (
                <SelectItem key={r} value={r} data-testid={`members-role-option-${r}`}>{r === "ALL" ? "Tous" : r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState testId="members-empty" title="Aucun membre trouvé"
          description="Ajustez vos filtres ou attendez de nouvelles demandes d'adhésion." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm" data-testid="members-table">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3 hidden md:table-cell">Niveau</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 hidden lg:table-cell">Inscription</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.user_id} className="border-t" data-testid={`member-row-${m.user_id}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#002060]">{m.profile?.display_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{m.role}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs">{m.access_level}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[m.status] || "bg-muted"}`}
                      data-testid={`member-status-${m.user_id}`}>{m.status}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {m.status === "PENDING" && (
                        <>
                          <Button size="sm" data-testid={`member-approve-${m.user_id}`}
                            className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                            onClick={() => update(m.user_id, { status: "ACTIVE" }, "Adhésion validée")}>Valider</Button>
                          <Button size="sm" variant="outline" data-testid={`member-reject-${m.user_id}`}
                            className="rounded-full"
                            onClick={() => update(m.user_id, { status: "REJECTED" }, "Demande refusée")}>Refuser</Button>
                        </>
                      )}
                      {m.status === "ACTIVE" && m.role !== "ADMIN_BUREAU" && (
                        <Button size="sm" variant="outline" data-testid={`member-suspend-${m.user_id}`} className="rounded-full"
                          onClick={() => update(m.user_id, { status: "SUSPENDED" }, "Membre suspendu")}>Suspendre</Button>
                      )}
                      {m.status === "SUSPENDED" && (
                        <Button size="sm" variant="outline" data-testid={`member-reactivate-${m.user_id}`} className="rounded-full"
                          onClick={() => update(m.user_id, { status: "ACTIVE" }, "Membre réactivé")}>Réactiver</Button>
                      )}
                      <Button size="sm" variant="ghost" data-testid={`member-edit-${m.user_id}`}
                        onClick={() => setEditing({ ...m, newRole: m.role, newLevel: m.access_level })}>Rôle</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="member-role-dialog">
          <DialogHeader><DialogTitle>Rôle et niveau — {editing?.profile?.display_name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rôle principal</Label>
                <Select value={editing.newRole}
                  onValueChange={(v) => setEditing({ ...editing, newRole: v, newLevel: LEVELS[v][0] })}>
                  <SelectTrigger data-testid="member-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(LEVELS).map((r) => (
                      <SelectItem key={r} value={r} data-testid={`role-option-${r}`}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Niveau d'accès / d'implication</Label>
                <Select value={editing.newLevel} onValueChange={(v) => setEditing({ ...editing, newLevel: v })}>
                  <SelectTrigger data-testid="member-level-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS[editing.newRole].map((l) => (
                      <SelectItem key={l} value={l} data-testid={`level-option-${l}`}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="member-role-cancel">Annuler</Button>
            <Button data-testid="member-role-save" className="bg-[#800020] hover:bg-[#63001a]"
              onClick={() => update(editing.user_id, { role: editing.newRole, access_level: editing.newLevel }, "Rôle mis à jour")}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
