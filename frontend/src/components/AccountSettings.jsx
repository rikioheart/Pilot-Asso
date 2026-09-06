import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Clock, Plane, Power, Trash2, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SectionCard, Chip } from "@/components/Ui";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const AccountSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [digestMode, setDigestMode] = useState(false);
  const [digestHour, setDigestHour] = useState(18);
  const [vacEnd, setVacEnd] = useState("");
  const [replacement, setReplacement] = useState("");
  const [bureau, setBureau] = useState([]);
  const [needReplacement, setNeedReplacement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const isBureau = user?.role === "ADMIN_BUREAU";

  const load = () => api.get("/account/settings").then((r) => {
    setSettings(r.data);
    setDigestMode(r.data.delivery_mode === "DIGEST");
    setDigestHour(r.data.digest_hour ?? 18);
  }).catch(() => {});

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (isBureau) api.get("/members", { params: { role: "ADMIN_BUREAU", limit: 100 } })
      .then((r) => setBureau((r.data.items || []).filter((m) => m.user_id !== user.user_id))).catch(() => {});
  }, [isBureau, user]);

  if (!settings) return <p className="text-muted-foreground" data-testid="account-loading">Chargement…</p>;
  const vacation = settings.vacation || { active: false };

  const saveDelivery = async () => {
    setBusy(true);
    try {
      await api.put("/account/notifications", {
        delivery_mode: digestMode ? "DIGEST" : "IMMEDIATE", digest_hour: digestHour });
      toast.success("Préférences de réception enregistrées");
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const startVacation = async () => {
    if (!vacEnd) { toast("Choisissez une date de fin pour activer le mode vacances."); return; }
    setBusy(true);
    try {
      await api.post("/account/vacation", { end_date: vacEnd, replacement_user_id: replacement || null });
      toast.success("Mode vacances activé");
      setNeedReplacement(false); setReplacement("");
      load();
    } catch (e) {
      if (e?.response?.status === 409) { setNeedReplacement(true); toast(apiError(e)); }
      else toast.error(apiError(e));
    } finally { setBusy(false); }
  };

  const endVacation = async () => {
    setBusy(true);
    try { await api.delete("/account/vacation"); toast.success("Mode vacances désactivé"); load(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const toggleDeactivate = async () => {
    const label = settings.deactivated ? "Réactiver votre compte ?"
      : "Désactiver votre compte ? Votre profil sera masqué, mais vos données seront conservées.";
    if (!(await confirmDialog(label))) return;
    setBusy(true);
    try {
      await api.post(settings.deactivated ? "/account/reactivate" : "/account/deactivate");
      toast.success(settings.deactivated ? "Compte réactivé" : "Compte désactivé");
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.post("/account/delete", { confirm: true });
      toast.success("Votre compte a été supprimé. À bientôt.");
      setTimeout(() => { window.location.href = "/login"; }, 1500);
    } catch (e) { toast.error(apiError(e)); setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="account-settings">
      {isBureau && (
        <div className="rounded-lg bg-[var(--marine-a8)] px-4 py-3 text-sm text-[var(--marine)]"
          data-testid="account-bureau-note">
          En tant que membre du Bureau, vous recevez toujours vos notifications immédiatement.
        </div>
      )}

      {!isBureau && (
        <SectionCard title="Comment recevoir mes notifications" icon={Bell} testId="account-delivery-card"
          subtitle="Choisissez la réception immédiate ou un résumé quotidien par e-mail.">
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
            <span>
              <span className="font-semibold text-[var(--marine)]">Digest quotidien</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Un seul e-mail par jour regroupant toutes vos notifications, au lieu d'un envoi immédiat.
              </span>
            </span>
            <Switch checked={digestMode} onCheckedChange={setDigestMode} data-testid="account-digest-switch" />
          </label>
          {digestMode && (
            <div className="mt-4 flex items-center gap-3" data-testid="account-digest-hour-row">
              <Clock className="h-4 w-4 text-[var(--bordeaux)]" />
              <Label className="text-sm">Heure d'envoi</Label>
              <Select value={String(digestHour)} onValueChange={(v) => setDigestHour(Number(v))}>
                <SelectTrigger className="w-28" data-testid="account-digest-hour-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}h00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={saveDelivery} disabled={busy} data-testid="account-delivery-save"
            className="mt-4 rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
            <Save className="mr-2 h-4 w-4" /> Enregistrer
          </Button>
        </SectionCard>
      )}

      <SectionCard title="Mode vacances" icon={Plane} testId="account-vacation-card"
        subtitle="Suspendez vos notifications pour une période. Elles seront archivées et consultables à votre retour.">
        {vacation.active ? (
          <div className="space-y-3" data-testid="account-vacation-active">
            <Chip tone="amber">Actif jusqu'au {vacation.end_date}</Chip>
            <p className="text-sm text-muted-foreground">
              Vos notifications sont suspendues. Vous pouvez y mettre fin à tout moment.
            </p>
            <Button variant="outline" onClick={endVacation} disabled={busy} data-testid="account-vacation-end"
              className="rounded-full">Désactiver le mode vacances</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Jusqu'au</Label>
                <Input type="date" value={vacEnd} data-testid="account-vacation-end-input"
                  onChange={(e) => setVacEnd(e.target.value)} className="w-44" />
              </div>
              {needReplacement && isBureau && (
                <div data-testid="account-replacement-row">
                  <Label className="text-xs">Remplaçant temporaire (Bureau)</Label>
                  <Select value={replacement} onValueChange={setReplacement}>
                    <SelectTrigger className="w-56" data-testid="account-replacement-select">
                      <SelectValue placeholder="Désigner un membre du Bureau" />
                    </SelectTrigger>
                    <SelectContent>
                      {bureau.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.profile?.display_name || m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={startVacation} disabled={busy} data-testid="account-vacation-start"
                className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">Activer</Button>
            </div>
            {needReplacement && (
              <p className="text-xs text-amber-700" data-testid="account-replacement-hint">
                Aucun autre profil Bureau actif ne peut prendre le relais. Désignez un remplaçant pour continuer.
              </p>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Désactiver ou supprimer mon compte" icon={Power} testId="account-danger-card"
        subtitle="Vous gardez le contrôle de vos données à tout moment.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <span className="text-sm">
              <span className="font-semibold text-[var(--marine)]">
                {settings.deactivated ? "Compte désactivé" : "Désactiver mon compte"}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Votre profil est masqué, vos données conservées. Réactivable à tout moment.
              </span>
            </span>
            <Button variant="outline" onClick={toggleDeactivate} disabled={busy}
              data-testid="account-deactivate-toggle" className="rounded-full">
              {settings.deactivated ? "Réactiver" : "Désactiver"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--bordeaux-a40)] p-4">
            <span className="text-sm">
              <span className="font-semibold text-[var(--bordeaux)]">Supprimer définitivement</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Vos données personnelles sont effacées (RGPD). Les données comptables sont conservées. Action irréversible.
              </span>
            </span>
            <Button variant="outline" onClick={() => { setDeleteWord(""); setDeleteOpen(true); }}
              data-testid="account-delete-open"
              className="rounded-full border-[var(--bordeaux)] text-[var(--bordeaux)] hover:bg-[var(--bordeaux)] hover:text-white">
              <Trash2 className="mr-2 h-4 w-4" /> Supprimer mon compte
            </Button>
          </div>
        </div>
      </SectionCard>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent data-testid="account-delete-dialog">
          <DialogHeader><DialogTitle>Confirmer la suppression définitive</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action est irréversible. Pour confirmer, écrivez <b>SUPPRIMER</b> ci-dessous.
          </p>
          <Input value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)}
            placeholder="SUPPRIMER" data-testid="account-delete-input" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} data-testid="account-delete-cancel">Annuler</Button>
            <Button disabled={deleteWord !== "SUPPRIMER" || busy} onClick={confirmDelete}
              data-testid="account-delete-confirm"
              className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountSettings;
