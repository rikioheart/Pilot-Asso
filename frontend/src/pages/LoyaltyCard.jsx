import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Star, RefreshCw, Gift, Download } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { themeColor } from "@/components/ThemeProvider";

export default function LoyaltyCard() {
  const [data, setData] = useState(null);
  const [recap, setRecap] = useState(null);
  const qrRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/loyalty/me");
      setData(data);
    } catch (e) {
      toast.error(apiError(e));
      setData(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/loyalty/monthly-recap").then((r) => setRecap(r.data)).catch(() => {});
  }, []);

  if (data === null) return <p className="text-muted-foreground">Chargement de votre carte…</p>;
  if (data === false) return <EmptyState testId="loyalty-unavailable" title="Carte indisponible"
    description="Votre profil ne dispose pas de carte d'engagement." />;

  const { card, stamps, rewards, next_reward, progress, source_labels, badges } = data;

  const regenerate = async () => {
    try {
      const { data } = await api.post("/loyalty/me/regenerate");
      setData(data);
      toast.success("Nouveau QR généré : l'ancien n'est plus valable.");
    } catch (e) { toast.error(apiError(e)); }
  };

  const download = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 640;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 640, 640);
      context.drawImage(image, 40, 40, 560, 560);
      const link = document.createElement("a");
      link.download = "qr-engagement-lavoixduchien.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("QR Code téléchargé");
    };
    image.src = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(source)))}`;
  };

  return (
    <div data-testid="loyalty-page">
      {badges?.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="loyalty-badges">
          <span className="text-sm font-semibold text-[var(--marine)]">Mes badges :</span>
          {badges.map((b) => (
            <Chip key={b.name} tone="bordeaux" testId={`loyalty-badge-${b.threshold}`}>{b.name}</Chip>
          ))}
        </div>
      )}
      <PageHeader breadcrumb="Mon espace" title="Ma carte d'engagement"
        subtitle="Présentez votre QR personnel au professionnel : il valide votre présence et votre tampon est ajouté." />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="vdc-grain relative overflow-hidden rounded-2xl p-6 text-white vdc-sidebar" data-testid="loyalty-card">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Carte {card.card_type}</p>
          <p className="mt-4 font-display text-5xl font-extrabold" data-testid="loyalty-total-points">
            {card.total_points}
          </p>
          <p className="text-sm text-white/70">tampon(s) cumulé(s)</p>

          <div className="mt-6 rounded-xl bg-white p-4 text-center" ref={qrRef}>
            <QRCodeSVG value={card.qr_token} size={168} level="M" includeMargin={false}
              fgColor={themeColor("marine")} data-testid="loyalty-qr" />
            <p className="mt-3 text-[11px] text-[#333]/60">
              QR anonyme : il ne contient aucune donnée personnelle.
            </p>
          </div>

          {next_reward && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>Prochain palier</span>
                <span>{card.total_points} / {next_reward.threshold}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-[var(--bordeaux)] transition-all"
                  style={{ width: `${Math.min(progress, 100)}%` }} data-testid="loyalty-progress" />
              </div>
              <p className="mt-2 text-sm font-semibold">{next_reward.reward || next_reward.label}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="ghost" size="sm" onClick={download} data-testid="loyalty-download-button"
              className="px-0 text-white/70 hover:bg-transparent hover:text-white">
              <Download className="mr-2 h-3.5 w-3.5" /> Télécharger mon QR
            </Button>
            <Button variant="ghost" size="sm" onClick={regenerate} data-testid="loyalty-regenerate-button"
              className="px-0 text-white/70 hover:bg-transparent hover:text-white">
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Régénérer mon QR
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {recap && (
            <SectionCard title={`Mon récap de ${recap.period.label}`} icon={Star} testId="loyalty-recap"
              subtitle="Résumé envoyé chaque 1er du mois par notification et par e-mail.">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone="bordeaux">{recap.gained} tampon(s) sur le mois</Chip>
                <Chip tone="muted">{recap.total_points} au total</Chip>
                {recap.next_reward && (
                  <Chip tone="amber">
                    Encore {recap.missing} pour « {recap.next_reward.reward || recap.next_reward.label} »
                  </Chip>
                )}
              </div>
              {recap.stamps.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {recap.stamps.map((s) => (
                    <li key={s.stamp_id}>
                      {s.activity_title} — {new Date(s.created_at).toLocaleDateString("fr-FR")}
                      {" "}({s.points > 0 ? `+${s.points}` : s.points})
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}

          <SectionCard title="Paliers d'avantages" icon={Gift} testId="loyalty-rewards">
            <div className="space-y-2">
              {rewards.length === 0 && (
                <p className="text-sm text-muted-foreground">Le Bureau n'a pas encore défini de palier.</p>
              )}
              {rewards.map((r) => (
                <div key={r.rule_id} data-testid={`loyalty-reward-${r.rule_id}`}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                    card.total_points >= (r.threshold || 0) ? "border-emerald-300 bg-emerald-50" : ""}`}>
                  <span>
                    <span className="font-semibold text-[var(--marine)]">{r.reward || r.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.threshold} tampons</span>
                  </span>
                  {card.total_points >= (r.threshold || 0) && (
                    <span className="text-xs font-bold text-emerald-700">atteint</span>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Historique de mes tampons" icon={Star} testId="loyalty-history">
            <div className="space-y-2">
              {stamps.length === 0 && (
                <EmptyState testId="loyalty-history-empty" title="Aucun tampon"
                  description="Participez à une activité ou un événement éligible : votre présence validée ajoute un tampon." />
              )}
              {stamps.map((s) => (
                <div key={s.stamp_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
                  data-testid={`loyalty-stamp-${s.stamp_id}`}>
                  <div>
                    <p className="text-sm font-semibold text-[var(--marine)]">{s.activity_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("fr-FR")} · {s.validated_by_name}
                    </p>
                    {s.reason && <p className="text-xs text-[var(--bordeaux)]">Motif : {s.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={s.is_manual ? "amber" : "muted"}>
                      {(source_labels || {})[s.source] || "Validation par un professionnel"}
                    </Chip>
                    <span className={`font-display text-lg font-extrabold ${
                      s.points < 0 ? "text-red-700" : "text-[var(--bordeaux)]"}`}>
                      {s.points > 0 ? `+${s.points}` : s.points}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
