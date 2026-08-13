import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const LEVEL_COLORS = {
  ACTION: "bg-[#800020]",
  WARNING: "bg-amber-500",
  SUCCESS: "bg-emerald-600",
  INFO: "bg-[#002060]",
};

export const NotificationBell = () => {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 8 } });
      setItems(data.items);
      setUnread(data.unread_count);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    load();
    const token = localStorage.getItem("vdc_token");
    if (!token) return;
    const wsUrl = `${process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws")}/api/ws/notifications?token=${token}`;
    let ws;
    let closed = false;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        if (closed) ws.close();
      };
      ws.onmessage = (evt) => {
        const notif = JSON.parse(evt.data);
        setItems((prev) => [notif, ...prev].slice(0, 8));
        setUnread((n) => n + 1);
      };
      ws.onerror = () => {};
    } catch {
      /* noop */
    }
    const poll = setInterval(load, 60000);
    return () => {
      closed = true;
      clearInterval(poll);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

  const markAll = async () => {
    await api.post("/notifications/read-all");
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button data-testid="notification-bell" aria-label="Notifications"
          className="relative grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-muted">
          <Bell className="h-5 w-5 text-[#002060]" />
          {unread > 0 && (
            <span data-testid="notification-unread-count"
              className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#800020] px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0" data-testid="notification-panel">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-display text-sm font-bold text-[#002060]">Notifications</p>
          <Button variant="ghost" size="sm" onClick={markAll} data-testid="notification-mark-all-read">
            <Check className="mr-1 h-3.5 w-3.5" /> Tout lire
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="notification-empty">
              Aucune notification pour le moment.
            </p>
          )}
          {items.map((n) => (
            <Link key={n.notification_id} to={n.link || "/notifications"}
              data-testid={`notification-item-${n.notification_id}`}
              className={`flex gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/60 ${n.is_read ? "opacity-60" : ""}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_COLORS[n.level] || "bg-[#002060]"}`} />
              <span>
                <span className="block text-sm font-semibold text-[#002060]">{n.title}</span>
                <span className="block text-xs text-muted-foreground">{n.message}</span>
              </span>
            </Link>
          ))}
        </div>
        <Link to="/notifications" data-testid="notification-see-all"
          className="block px-4 py-3 text-center text-sm font-semibold text-[#800020] hover:underline">
          Voir toutes les notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
};
