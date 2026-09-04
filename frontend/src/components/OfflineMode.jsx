import { createContext, useContext, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { api, isOffline, lastSyncAt, pendingOfflineStamps, syncOfflineStamps } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const Ctx = createContext({ offline: false, pending: 0 });

const PREFETCH = ["/dogs", "/professionals", "/activities", "/events"];

/** Suit l'état réseau, pré-charge le cache lecture seule et synchronise les scans en attente. */
export const OfflineProvider = ({ children }) => {
  const { user } = useAuth();
  const [offline, setOffline] = useState(isOffline());
  const [pending, setPending] = useState(pendingOfflineStamps().length);

  useEffect(() => {
    const refreshPending = () => setPending(pendingOfflineStamps().length);
    const goOffline = () => { setOffline(true); toast.message("Connexion perdue : mode hors connexion (lecture seule)", { id: "offline" }); };
    const goOnline = async () => {
      setOffline(false);
      const { ok, failed, rejected } = await syncOfflineStamps();
      refreshPending();
      if (ok || rejected) toast.success(`Reconnecté : ${ok} scan(s) synchronisé(s)${rejected ? `, ${rejected} refusé(s)` : ""}`, { id: "offline" });
      else if (!failed) toast.success("Connexion rétablie", { id: "offline" });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("vdc-offline-queue", refreshPending);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("vdc-offline-queue", refreshPending);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.offline = offline ? "on" : "off";
  }, [offline]);

  useEffect(() => {
    if (!user || user.status !== "ACTIVE" || offline) return;
    PREFETCH.forEach((url) => api.get(url).catch(() => {}));
    if (pendingOfflineStamps().length) syncOfflineStamps().then(() => setPending(pendingOfflineStamps().length));
  }, [user, offline]);

  return <Ctx.Provider value={{ offline, pending }}>{children}</Ctx.Provider>;
};

export const useOffline = () => useContext(Ctx);

export const OfflineIndicator = () => {
  const { offline, pending } = useOffline();
  if (!offline && pending === 0) return null;
  const since = lastSyncAt() ? new Date(lastSyncAt()).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : null;
  return (
    <div role="status" data-testid="offline-indicator"
      title={since ? `Données de votre dernière session connectée (${since})` : "Données de votre dernière session connectée"}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
        offline ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground"}`}>
      <WifiOff className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{offline ? "Hors connexion · lecture seule" : "Synchronisation"}</span>
      {pending > 0 && <span className="rounded-full bg-[var(--bordeaux)] px-1.5 text-[10px] text-white" data-testid="offline-pending-count">{pending}</span>}
    </div>
  );
};
