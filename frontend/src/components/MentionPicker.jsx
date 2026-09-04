import { useEffect, useState } from "react";
import { AtSign } from "lucide-react";
import { api } from "@/lib/api";

export function MentionPicker({ value = [], onChange, testId = "mentions" }) {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    api.get("/members", { params: { status: "ACTIVE", limit: 300 } })
      .then((r) => setMembers(r.data.items || [])).catch(() => {});
  }, []);
  if (members.length === 0) return null;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div data-testid={`${testId}-picker`}>
      <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <AtSign className="h-3 w-3" /> Mentionner des profils (notification directe)
      </p>
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
        {members.map((m) => {
          const id = m.user_id;
          const name = m.profile?.display_name || m.email;
          return (
            <button type="button" key={id} data-testid={`${testId}-${id}`} onClick={() => toggle(id)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                value.includes(id) ? "border-[var(--bordeaux)] bg-[var(--bordeaux)] text-white"
                  : "text-muted-foreground hover:border-[var(--bordeaux-a40)]"}`}>
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
