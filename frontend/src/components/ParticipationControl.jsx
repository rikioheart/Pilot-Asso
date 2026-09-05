import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, HelpCircle, X, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";

const STATES = [
  { key: "PARTICIPE", label: "Je participe", icon: Check, tone: "bg-[var(--status-ok,#1e7f4f)]" },
  { key: "PEUT_ETRE", label: "Peut-être", icon: HelpCircle, tone: "bg-amber-500" },
  { key: "PAS_POSSIBLE", label: "Pas possible", icon: X, tone: "bg-slate-500" },
];
const ROLE_LABEL = { BUREAU: "Bureau", PRO: "Pros", MEMBRE: "Membres" };
const ROLE_OF = { ADMIN_BUREAU: "BUREAU", PROFESSIONNEL: "PRO", PARTICULIER: "MEMBRE" };

export function ParticipationControl({ elementType, elementId, testId = "rsvp" }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => api.get("/rsvp/summary",
    { params: { element_type: elementType, element_id: elementId } })
    .then((r) => setData(r.data)).catch(() => {}), [elementType, elementId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;

  const setState = async (state) => {
    try {
      if (data.my_state === state) {
        await api.delete("/rsvp", { params: { element_type: elementType, element_id: elementId } });
      } else {
        await api.post("/rsvp", { element_type: elementType, element_id: elementId, state });
      }
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="space-y-2" data-testid={`${testId}-control`}>
      <div className="flex flex-wrap gap-2">
        {STATES.map((s) => {
          const active = data.my_state === s.key;
          return (
            <button key={s.key} data-testid={`${testId}-${s.key}`} onClick={() => setState(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                active ? `${s.tone} border-transparent text-white` : "text-[var(--marine)] hover:bg-muted"}`}>
              <s.icon className="h-3.5 w-3.5" /> {s.label}
              <span className={`ml-1 rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-muted"}`}
                data-testid={`${testId}-count-${s.key}`}>{data.counts[s.key].total}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid={`${testId}-breakdown`}>
        {STATES.map((s) => (
          <span key={s.key}>
            <b className="text-[var(--marine)]">{s.label}</b> :{" "}
            {["BUREAU", "PRO", "MEMBRE"].map((r) => `${ROLE_LABEL[r]} ${data.counts[s.key].by_role[r]}`).join(" · ")}
          </span>
        ))}
      </div>
      {data.can_detail && data.responders && (
        <>
          <button onClick={() => setOpen(!open)} data-testid={`${testId}-detail-toggle`}
            className="text-xs font-semibold text-[var(--bordeaux)] hover:underline">
            <Users className="mr-1 inline h-3 w-3" /> {open ? "Masquer" : "Voir"} le détail des réponses
          </button>
          {open && (
            <div className="rounded-lg border p-2 text-xs" data-testid={`${testId}-detail`}>
              {STATES.map((s) => (
                <div key={s.key} className="mb-1 last:mb-0">
                  <span className="font-semibold text-[var(--marine)]">{s.label} :</span>{" "}
                  {data.responders[s.key].length
                    ? data.responders[s.key].map((p) => `${p.display_name} (${ROLE_LABEL[ROLE_OF[p.role] || "MEMBRE"]})`).join(", ")
                    : "—"}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
