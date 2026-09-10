import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { Camera, Search, CameraOff, Star, CheckCircle2 } from "lucide-react";
import { api, apiError, isOffline, queueOfflineStamp } from "@/lib/api";
import { chime } from "@/lib/sound";
import { useOffline } from "@/components/OfflineMode";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SCANNER_ID = "loyalty-scanner-region";

export default function LoyaltyScan() {
  const [member, setMember] = useState(null);
  const [activityId, setActivityId] = useState("");
  const [eventId, setEventId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [offlineToken, setOfflineToken] = useState(null);
  const { offline, pending } = useOffline();
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const scannerRef = useRef(null);

  const [catalog, setCatalog] = useState({ eligible_activities: [], eligible_events: [] });
  useEffect(() => {
    api.get("/loyalty/eligible").then((r) => setCatalog(r.data)).catch(() => {});
    api.get("/loyalty/history", { params: { limit: 20 } }).then((r) => setHistory(r.data.items)).catch(() => {});
    return () => {
      if (scannerRef.current) scannerRef.current.stop().catch(() => {});
    };
  }, []);

  const identify = (data) => {
    setMember(data);
    setActivityId("");
    setEventId("");
    setResults([]);
  };

  const holdOffline = (token) => {
    setOfflineToken(token);
    setMember({ user_id: null, display_name: "Adhérent (QR mémorisé, hors connexion)", offline: true, dogs: [],
      total_points: "—", card_type: "—", eligible_activities: catalog.eligible_activities || [],
      eligible_events: catalog.eligible_events || [] });
    setActivityId(""); setEventId(""); setResults([]);
    toast.message("Hors connexion : le scan sera synchronisé à la reconnexion");
  };

  const submitToken = async () => {
    if (tokenInput.trim().length < 6) return toast.error("Saisissez le code complet du QR");
    if (isOffline()) { holdOffline(tokenInput.trim()); setTokenInput(""); return; }
    try {
      const { data } = await api.post("/loyalty/scan", { qr_token: tokenInput.trim() });
      identify(data);
      setTokenInput("");
      toast.success(`Adhérent identifié : ${data.display_name}`);
    } catch (e) { toast.error(apiError(e)); }
  };

  const startScan = async () => {
    setScanning(true);
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, async (decoded) => {
        await scanner.stop().catch(() => {});
        scannerRef.current = null;
        setScanning(false);
        if (isOffline()) { holdOffline(decoded); return; }
        try {
          const { data } = await api.post("/loyalty/scan", { qr_token: decoded });
          identify(data);
          toast.success(`Adhérent identifié : ${data.display_name}`);
        } catch (e) {
          if (!e.response) holdOffline(decoded); else toast.error(apiError(e));
        }
      });
    } catch (e) {
      setScanning(false);
      toast.error("Caméra indisponible. Utilisez la recherche manuelle.");
    }
  };

  const stopScan = async () => {
    if (scannerRef.current) await scannerRef.current.stop().catch(() => {});
    scannerRef.current = null;
    setScanning(false);
  };

  const search = async () => {
    if (manual.trim().length < 2) return toast.error("Saisissez au moins 2 caractères");
    try {
      const { data } = await api.get("/loyalty/search", { params: { q: manual } });
      setResults(data.items);
      if (data.items.length === 0) toast.error("Aucun adhérent trouvé");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const confirm = async () => {
    if (!activityId && !eventId) return toast.error("Sélectionnez une activité ou un événement éligible");
    if (member?.offline || isOffline()) {
      const n = queueOfflineStamp({ qr_token: offlineToken || undefined, user_id: member?.user_id || undefined,
        activity_id: activityId || null, event_id: eventId || null });
      window.dispatchEvent(new Event("vdc-offline-queue"));
      toast.success(`Tampon enregistré localement (${n} en attente de synchronisation)`);
      setMember(null); setOfflineToken(null); setActivityId(""); setEventId("");
      return;
    }
    try {
      const { data } = await api.post("/loyalty/stamp", {
        user_id: member.user_id,
        activity_id: activityId || null, event_id: eventId || null });
      toast.success(`+${data.stamp.points} tampon(s) — total ${data.total_points}`);
      chime("badge");
      setMember(null);
      setActivityId(""); setEventId("");
      const refreshed = await api.get("/loyalty/history", { params: { limit: 20 } });
      setHistory(refreshed.data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="loyalty-scan-page">
      <PageHeader breadcrumb="Terrain" title="Valider une participation"
        subtitle="Scannez le QR d'engagement de l'adhérent (ou saisissez son code), choisissez l'activité ou l'événement éligible, validez en un clic." />

      {(offline || pending > 0) && (
        <p className="mb-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-700" data-testid="loyalty-offline-banner">
          {offline ? "Mode dégradé hors connexion : les scans sont enregistrés sur cet appareil et synchronisés automatiquement dès le retour du réseau."
            : `${pending} scan(s) en attente de synchronisation.`}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5" data-testid="loyalty-scanner">
            <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">1. Identifier l'adhérent</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {scanning ? (
                <Button variant="outline" className="rounded-full" onClick={stopScan} data-testid="loyalty-stop-scan">
                  <CameraOff className="mr-2 h-4 w-4" /> Arrêter la caméra
                </Button>
              ) : (
                <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" onClick={startScan}
                  data-testid="loyalty-start-scan">
                  <Camera className="mr-2 h-4 w-4" /> Scanner le QR
                </Button>
              )}
            </div>
            <div id={SCANNER_ID} className={`mt-4 overflow-hidden rounded-xl ${scanning ? "block" : "hidden"}`} />

            <div className="mt-4 border-t pt-4">
              <Label className="text-xs">Saisie manuelle du code du QR (secours si la caméra est indisponible)</Label>
              <div className="mt-2 flex gap-2">
                <Input value={tokenInput} data-testid="loyalty-token-input" placeholder="Code du QR Code"
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitToken()} />
                <Button variant="outline" className="rounded-full" onClick={submitToken}
                  data-testid="loyalty-token-submit">Valider</Button>
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <Label className="text-xs">Rechercher manuellement (nom, prénom, chien, identifiant carte)</Label>
              <div className="mt-2 flex gap-2">
                <Input value={manual} data-testid="loyalty-manual-input" placeholder="Sophie, Nikko, card_…"
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()} />
                <Button variant="outline" className="rounded-full" onClick={search} data-testid="loyalty-manual-search">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {results.length > 0 && (
                <div className="mt-3 space-y-2" data-testid="loyalty-search-results">
                  {results.map((r) => (
                    <button key={r.user_id} onClick={() => identify(r)} data-testid={`loyalty-result-${r.user_id}`}
                      className="w-full rounded-lg border px-4 py-2 text-left text-sm transition-colors hover:border-[var(--bordeaux-a40)] hover:bg-muted/50">
                      <span className="font-semibold text-[var(--marine)]">{r.display_name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.city || ""} {r.dogs.length > 0 && `· ${r.dogs.join(", ")}`} · {r.total_points} pts
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {member && (
            <div className="rounded-xl border bg-card p-5" data-testid="loyalty-selected-member">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">2. Élément éligible</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {member.display_name} · {member.total_points} tampon(s) · carte {member.card_type}
                {member.dogs.length > 0 && ` · ${member.dogs.join(", ")}`}
              </p>
              {member.eligible_activities.length === 0 && (member.eligible_events || []).length === 0 ? (
                <EmptyState testId="loyalty-no-eligible" title="Aucun élément éligible"
                  description="Le Bureau doit d'abord marquer une activité ou un événement éligible à la carte d'engagement." />
              ) : (
                <div className="mt-4 space-y-4">
                  <Select value={activityId}
                    onValueChange={(v) => { setActivityId(v); setEventId(""); }}>
                    <SelectTrigger data-testid="loyalty-activity-select">
                      <SelectValue placeholder="Choisir l'activité réalisée" />
                    </SelectTrigger>
                    <SelectContent>
                      {member.eligible_activities.map((a) => (
                        <SelectItem key={a.activity_id} value={a.activity_id} data-testid={`loyalty-activity-${a.activity_id}`}>
                          {a.title} (+{a.points}){a.already_stamped ? " · déjà tamponnée" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(member.eligible_events || []).length > 0 && (
                    <Select value={eventId}
                      onValueChange={(v) => { setEventId(v); setActivityId(""); }}>
                      <SelectTrigger data-testid="loyalty-event-select">
                        <SelectValue placeholder="…ou l'événement réalisé" />
                      </SelectTrigger>
                      <SelectContent>
                        {member.eligible_events.map((e) => (
                          <SelectItem key={e.event_id} value={e.event_id} data-testid={`loyalty-event-${e.event_id}`}>
                            {e.title} (+{e.points}){e.already_stamped ? " · déjà tamponné" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button onClick={confirm} className="w-full rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                    data-testid="loyalty-confirm-stamp">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Valider la présence et ajouter le tampon
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    L'éligibilité est contrôlée côté serveur : aucun tampon possible sur un élément non éligible.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5" data-testid="loyalty-scan-history">
          <h2 className="inline-flex items-center gap-2 font-display text-base md:text-lg font-bold text-[var(--marine)]">
            <Star className="h-4 w-4 text-[var(--bordeaux)]" /> Derniers tampons
          </h2>
          <div className="mt-4 space-y-2">
            {history.length === 0 && (
              <EmptyState testId="loyalty-scan-history-empty" title="Aucun tampon encore"
                description="Chaque validation est historisée avec son auteur." />
            )}
            {history.map((s) => (
              <div key={s.stamp_id} className="flex items-center justify-between rounded-lg border px-4 py-3"
                data-testid={`loyalty-scan-history-${s.stamp_id}`}>
                <div>
                  <p className="text-sm font-semibold text-[var(--marine)]">{s.member_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.activity_title} · {new Date(s.created_at).toLocaleDateString("fr-FR")} · par {s.validated_by_name}
                  </p>
                </div>
                <span className="font-display text-lg font-extrabold text-[var(--bordeaux)]">+{s.points}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
