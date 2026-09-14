import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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

const CATEGORIES = {
  PROFESSIONNEL: "Professionnel", REPRESENTANT_PRO: "Représentant professionnel",
  BIENFAITEUR: "Bienfaiteur", PARTICULIER: "Particulier", BENEVOLE: "Bénévole",
  APPRENANT: "Apprenant", MEMBRE_SOUTIEN: "Membre soutien",
};

export default function Members() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [permCatalog, setPermCatalog] = useState(null);
  const status = params.get("status") || "";
  const role = params.get("role") || "";

  useEffect(() => {
    api.get("/settings/rbac").then((r) => setPermCatalog(r.data)).catch(() => {});
  }, []);

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

  const saveMember = async () => {
    try {
      await api.put(`/members/${editing.user_id}`,
        { role: editing.newRole, access_level: editing.newLevel,
          granted: editing.granted || [], revoked: editing.revoked || [] });
      await api.put(`/members/${editing.user_id}/category`,
        { member_category: editing.newCategory });
      toast.success("Rôle, permissions et catégorie mis à jour");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const permState = (p) => (editing?.granted?.includes(p) ? "granted"
    : editing?.revoked?.includes(p) ? "revoked" : "default");
  const setPermState = (p, state) => {
    const granted = new Set(editing.granted || []);
    const revoked = new Set(editing.revoked || []);
    granted.delete(p); revoked.delete(p);
    if (state === "granted") granted.add(p);
    if (state === "revoked") revoked.add(p);
    setEditing({ ...editing, granted: [...granted], revoked: [...revoked] });
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
                    <button type="button" data-testid={`member-collapse-${m.user_id}`}
                      onClick={() => setCollapsed((c) => ({ ...c, [m.user_id]: !c[m.user_id] }))}
                      className="text-left">
                      <p className="font-semibold text-[var(--marine)]">{m.profile?.display_name || "—"}</p>
                      {!collapsed[m.user_id] && (
                        <>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                          {m.profile?.pro_space?.company_name && (
                            <p className="text-xs font-medium text-[var(--bordeaux)]">
                              {m.profile.pro_space.company_name}
                            </p>
                          )}
                          {m.profile?.member_category && (
                            <p className="text-xs text-muted-foreground">
                              {CATEGORIES[m.profile.member_category] || m.profile.member_category}
                            </p>
                          )}
                        </>
                      )}
                    </button>
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
                            className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
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
                        onClick={() => setEditing({ ...m, newRole: m.role, newLevel: m.access_level,
                          newCategory: m.profile?.member_category || "PARTICULIER",
                          granted: m.permission_overrides?.granted || [],
                          revoked: m.permission_overrides?.revoked || [] })}>Rôle</Button>
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
          <DialogHeader>
            <DialogTitle>Rôle et niveau — {editing?.profile?.display_name}</DialogTitle>
            <DialogDescription>Ajustez le rôle, le niveau, la catégorie et les permissions individuelles de ce membre.</DialogDescription>
          </DialogHeader>
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
              <div className="space-y-2">
                <Label>Catégorie d'adhésion</Label>
                <Select value={editing.newCategory}
                  onValueChange={(v) => setEditing({ ...editing, newCategory: v })}>
                  <SelectTrigger data-testid="member-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([key, label]) => (
                      <SelectItem key={key} value={key} data-testid={`category-option-${key}`}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Représentant professionnel, professionnel et bienfaiteur apparaissent
                  automatiquement dans l'annuaire des professionnels.
                </p>
              </div>

              {editing.newRole !== "ADMIN_BUREAU" && permCatalog && (
                <div className="space-y-2" data-testid="member-permissions">
                  <Label>Permissions individuelles</Label>
                  <p className="text-xs text-muted-foreground">
                    Par défaut, les permissions découlent du niveau. Vous pouvez en accorder ou en révoquer
                    ponctuellement pour ce membre.
                  </p>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border p-2">
                    {permCatalog.permissions.map((p) => {
                      const base = (permCatalog.level_permissions[editing.newLevel] || []).includes(p);
                      const state = permState(p);
                      return (
                        <div key={p} className="flex items-center justify-between gap-2 text-xs"
                          data-testid={`member-perm-${p}`}>
                          <span className="font-mono">
                            {p} {base && <span className="text-emerald-600">· inclus</span>}
                          </span>
                          <div className="flex gap-1">
                            <Button type="button" size="sm" variant={state === "granted" ? "default" : "outline"}
                              data-testid={`member-perm-grant-${p}`}
                              className={`h-6 rounded-full px-2 ${state === "granted" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                              onClick={() => setPermState(p, state === "granted" ? "default" : "granted")}>Accorder</Button>
                            <Button type="button" size="sm" variant={state === "revoked" ? "default" : "outline"}
                              data-testid={`member-perm-revoke-${p}`}
                              className={`h-6 rounded-full px-2 ${state === "revoked" ? "bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" : ""}`}
                              onClick={() => setPermState(p, state === "revoked" ? "default" : "revoked")}>Révoquer</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="member-role-cancel">Annuler</Button>
            <Button data-testid="member-role-save" className="bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
              onClick={saveMember}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
