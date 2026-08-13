import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UploadCloud, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ImportCsv() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [mapping, setMapping] = useState({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadHistory = () => api.get("/imports/history").then((r) => setHistory(r.data.items)).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const analyze = async () => {
    if (!file) return toast.error("Choisissez un fichier CSV");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/imports/analyze", form);
      setAnalysis(data);
      setMapping(data.suggested_mapping);
      setResult(null);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      form.append("update_existing", updateExisting ? "true" : "false");
      const { data } = await api.post("/imports/execute", form);
      setResult(data);
      toast.success(`${data.created} créé(s), ${data.updated} mis à jour, ${data.skipped} ignoré(s)`);
      loadHistory();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const fields = analysis?.target_fields || {};

  return (
    <div data-testid="import-page">
      <PageHeader breadcrumb="Administration" title="Import de données"
        subtitle="Chargez un CSV, vérifiez les correspondances, contrôlez les doublons, puis confirmez. Rien n'est écrasé silencieusement." />

      <div className="space-y-6">
        <div className="rounded-xl border bg-card p-5" data-testid="import-step-file">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">1. Fichier CSV</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fichier (.csv)</Label>
              <Input type="file" accept=".csv" data-testid="import-file-input"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setAnalysis(null); setResult(null); }} />
            </div>
            <Button onClick={analyze} disabled={busy || !file} data-testid="import-analyze-button"
              className="rounded-full bg-[#002060] hover:bg-[#001740]">
              <UploadCloud className="mr-2 h-4 w-4" /> Analyser
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Colonnes reconnues : Nom, Prénom, Email, Rôle, Catégorie, Date adhésion, Chien, Nombre activités,
            Points fidélité, Téléphone, Ville, Département.
          </p>
        </div>

        {analysis && (
          <>
            <div className="rounded-xl border bg-card p-5" data-testid="import-step-mapping">
              <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">2. Correspondance des colonnes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {analysis.row_count} ligne(s) détectée(s), séparateur « {analysis.delimiter} ».
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {analysis.columns.map((col) => (
                  <div key={col} className="flex items-center gap-3">
                    <span className="w-1/2 truncate text-sm font-medium text-[#002060]" title={col}>{col}</span>
                    <Select value={mapping[col] || "IGNORE"}
                      onValueChange={(v) => setMapping({ ...mapping, [col]: v === "IGNORE" ? null : v })}>
                      <SelectTrigger className="flex-1" data-testid={`import-map-${col}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IGNORE">Ignorer</SelectItem>
                        {Object.entries(fields).map(([key, label]) => (
                          <SelectItem key={key} value={key} data-testid={`import-map-option-${key}`}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5" data-testid="import-step-preview">
              <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">3. Prévisualisation et conflits</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs" data-testid="import-preview-table">
                  <thead className="bg-muted/60 text-left uppercase tracking-wide text-muted-foreground">
                    <tr>{analysis.columns.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {analysis.preview.map((row, i) => (
                      <tr key={i} className="border-t">
                        {analysis.columns.map((c) => <td key={c} className="px-3 py-2">{row[c]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/60 p-3" data-testid="import-existing-count">
                  <p className="font-display text-xl font-extrabold text-[#800020]">{analysis.existing_emails.length}</p>
                  <p className="text-xs text-muted-foreground">déjà présents en base</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3" data-testid="import-duplicates-count">
                  <p className="font-display text-xl font-extrabold text-[#800020]">{analysis.duplicates_in_file.length}</p>
                  <p className="text-xs text-muted-foreground">doublons dans le fichier</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3" data-testid="import-missing-email-count">
                  <p className="font-display text-xl font-extrabold text-[#800020]">{analysis.missing_email_rows}</p>
                  <p className="text-xs text-muted-foreground">lignes sans e-mail</p>
                </div>
              </div>
              {analysis.existing_emails.length > 0 && (
                <p className="mt-3 flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                  {analysis.existing_emails.slice(0, 6).join(", ")}
                  {analysis.existing_emails.length > 6 && "…"}
                </p>
              )}
              <label className="mt-4 flex items-center gap-2 text-sm">
                <Checkbox checked={updateExisting} data-testid="import-update-existing"
                  onCheckedChange={(v) => setUpdateExisting(!!v)} />
                Mettre à jour les comptes existants (sinon ils sont ignorés et listés en conflits)
              </label>
              <Button onClick={execute} disabled={busy} data-testid="import-execute-button"
                className="mt-4 rounded-full bg-[#800020] hover:bg-[#63001a]">
                Confirmer l'import
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="rounded-xl border bg-card p-5" data-testid="import-result">
            <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">4. Résultat</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[["Créés", result.created], ["Mis à jour", result.updated],
                ["Ignorés", result.skipped], ["Lignes", result.row_count]].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted/60 p-3">
                  <p className="font-display text-2xl font-extrabold text-[#800020]">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {result.conflicts.length > 0 ? (
              <div className="mt-4 space-y-1 text-xs" data-testid="import-conflicts">
                {result.conflicts.map((c, i) => (
                  <p key={i} className="text-amber-700">Ligne {c.line} — {c.email} : {c.reason}</p>
                ))}
              </div>
            ) : (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Aucun conflit
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl border bg-card p-5" data-testid="import-history">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Historique des imports</h2>
          {history.length === 0 ? (
            <EmptyState testId="import-history-empty" title="Aucun import" description="Vos imports seront tracés ici." />
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              {history.map((h) => (
                <div key={h.import_id} className="flex flex-wrap justify-between gap-2 rounded-lg border px-4 py-2">
                  <span className="font-semibold text-[#002060]">{h.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("fr-FR")} · {h.created} créés, {h.updated} mis à jour, {h.skipped} ignorés
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
