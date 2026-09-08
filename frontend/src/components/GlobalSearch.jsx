import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";

export const GlobalSearch = () => {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    if (q.length < 2) { setGroups([]); setActive(""); return; }
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

  const visible = active ? groups.filter((g) => g.label === active) : groups;

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} data-testid="global-search-input"
        placeholder="Rechercher un membre, un chien, une activité…" className="pl-9 rounded-full bg-muted/60" />
      {groups.length > 0 && (
        <div data-testid="global-search-results"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border bg-card shadow-xl">
          <div className="flex flex-wrap gap-1 border-b p-2" data-testid="global-search-filters">
            <button onClick={() => setActive("")} data-testid="search-filter-all"
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active === "" ? "bg-[var(--bordeaux)] text-white" : "text-muted-foreground hover:bg-muted"}`}>
              Tout
            </button>
            {groups.map((g) => (
              <button key={g.label} onClick={() => setActive(g.label)}
                data-testid={`search-filter-${g.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active === g.label ? "bg-[var(--bordeaux)] text-white" : "text-muted-foreground hover:bg-muted"}`}>
                {g.label} ({g.items.length})
              </button>
            ))}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {visible.map((g) => (
              <div key={g.label}>
                <p className="bg-muted/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {g.items.map((it) => (
                  <Link key={it.id} to={it.link} onClick={() => setQ("")}
                    data-testid={`search-result-${it.id}`}
                    className="block px-3 py-2 text-sm transition-colors hover:bg-muted">
                    <span className="font-semibold text-[var(--marine)]">{it.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{it.subtitle}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
