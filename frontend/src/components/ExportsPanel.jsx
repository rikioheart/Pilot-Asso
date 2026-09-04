import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const KINDS = [
  ["finance", "Finances (entrées / sorties)"],
  ["shares", "Parts professionnels"],
  ["reimbursements", "Remboursements"],
  ["members", "Adhérents"],
  ["stock", "Stocks & mouvements"],
  ["participants", "Participants aux activités"],
  ["documents", "Registre des documents"],
  ["statistics", "Statistiques du réseau"],
];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** Exports Excel filtrables par période, disponibles pour le Bureau. */
export const ExportsPanel = () => {
  const year = new Date().getFullYear();
  const [filters, setFilters] = useState({ year: String(year), period: "YEAR", value: "1" });
  const [busy, setBusy] = useState(null);

  const download = async (kind, label) => {
    setBusy(kind);
    try {
      const params = new URLSearchParams({ year: filters.year });
      if (filters.period === "MONTH") params.set("month", filters.value);
      if (filters.period === "QUARTER") params.set("quarter", filters.value);
      const { data } = await api.get(`/exports/${kind}?${params}`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lavoixduchien-${kind}-${filters.year}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Export « ${label} » téléchargé`);
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(null); }
  };

  return (
    <SectionCard title="Exports Excel" icon={FileSpreadsheet} testId="exports-panel"
      subtitle="Choisissez une période puis téléchargez le fichier de votre choix.">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Année</Label>
          <Select value={filters.year} onValueChange={(v) => setFilters({ ...filters, year: v })}>
            <SelectTrigger data-testid="export-year-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[year, year - 1, year - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Période</Label>
          <Select value={filters.period}
            onValueChange={(v) => setFilters({ ...filters, period: v, value: "1" })}>
            <SelectTrigger data-testid="export-period-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="YEAR">Année entière</SelectItem>
              <SelectItem value="QUARTER">Trimestre</SelectItem>
              <SelectItem value="MONTH">Mois</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filters.period !== "YEAR" && (
          <div>
            <Label>{filters.period === "MONTH" ? "Mois" : "Trimestre"}</Label>
            <Select value={filters.value} onValueChange={(v) => setFilters({ ...filters, value: v })}>
              <SelectTrigger data-testid="export-value-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(filters.period === "MONTH"
                  ? MONTHS.map((m, i) => [String(i + 1), m])
                  : [1, 2, 3, 4].map((q) => [String(q), `T${q}`])
                ).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {KINDS.map(([kind, label]) => (
          <Button key={kind} variant="outline" disabled={busy === kind}
            data-testid={`export-${kind}-button`} onClick={() => download(kind, label)}
            className="justify-start rounded-full">
            {busy === kind
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4 text-[var(--bordeaux)]" />}
            {label}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
};

export default ExportsPanel;
