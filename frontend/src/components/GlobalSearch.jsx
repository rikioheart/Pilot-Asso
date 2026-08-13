import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";

export const GlobalSearch = () => {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (q.length < 2) return setGroups([]);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q } });
        setGroups(data.groups);
      } catch {
        setGroups([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} data-testid="global-search-input"
        placeholder="Rechercher un membre, un chien…" className="pl-9 rounded-full bg-muted/60" />
      {groups.length > 0 && (
        <div data-testid="global-search-results"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border bg-card shadow-xl">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="bg-muted/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </p>
              {g.items.map((it) => (
                <Link key={it.id} to={it.link} onClick={() => setQ("")}
                  data-testid={`search-result-${it.id}`}
                  className="block px-3 py-2 text-sm transition-colors hover:bg-muted">
                  <span className="font-semibold text-[#002060]">{it.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{it.subtitle}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
