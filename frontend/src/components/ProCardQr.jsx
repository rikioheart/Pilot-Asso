import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Download, ExternalLink, Copy, Maximize2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullscreenQR } from "@/components/FullscreenQR";
import { themeColor } from "@/components/ThemeProvider";

export const proCardUrl = (userId) => `${window.location.origin}/carte/${userId}`;

/** QR Code carte de visite numérique d'un professionnel (URL publique, sans connexion). */
export const ProCardQr = ({ userId, name, subtitle, autoFullscreen = false, testId = "pro-card-qr" }) => {
  const ref = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const url = proCardUrl(userId);

  useEffect(() => { if (autoFullscreen) setFullscreen(true); }, [autoFullscreen]);

  const download = () => {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 720;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 640, 720);
      ctx.drawImage(img, 40, 40, 560, 560);
      ctx.fillStyle = themeColor("marine"); ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
      ctx.fillText((name || "Carte de visite").slice(0, 40), 320, 650);
      ctx.fillStyle = themeColor("bordeaux"); ctx.font = "20px sans-serif";
      ctx.fillText("La Voix du Chien", 320, 690);
      const link = document.createElement("a");
      link.download = `carte-visite-${(name || userId).replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(xml)))}`;
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success("Lien copié"); }
    catch { toast.error("Copie impossible"); }
  };

  const share = async () => {
    const data = { title: name || "Ma carte de visite",
      text: `Découvrez ma carte de visite — ${name || "La Voix du Chien"}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); toast.success("Lien copié — le partage n'est pas disponible ici"); }
    } catch { /* partage annulé par l'utilisateur */ }
  };

  return (
    <div className="rounded-xl border bg-card p-5" data-testid={testId}>
      {fullscreen && (
        <FullscreenQR value={url} title={name} subtitle={subtitle}
          note="Scannez pour ouvrir ma carte de visite publique."
          onClose={() => setFullscreen(false)} />
      )}
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        QR Code carte de visite
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Distinct du QR de présence : il ouvre la carte publique du professionnel, consultable sans connexion.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div ref={ref} className="rounded-lg bg-white p-3 shadow-sm">
          <QRCodeSVG value={url} size={160} level="M" fgColor={themeColor("marine")} />
        </div>
        <div className="flex flex-col gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" data-testid={`${testId}-link`}
            className="break-all text-xs text-[var(--marine)] underline">{url}</a>
          <Button type="button" size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
            onClick={download} data-testid={`${testId}-download`}>
            <Download className="mr-2 h-3.5 w-3.5" /> Télécharger le QR (PNG)
          </Button>
          <Button type="button" size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
            onClick={share} data-testid={`${testId}-share`}>
            <Share2 className="mr-2 h-3.5 w-3.5" /> Partager
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-full"
            onClick={() => setFullscreen(true)} data-testid={`${testId}-fullscreen`}>
            <Maximize2 className="mr-2 h-3.5 w-3.5" /> Afficher en plein écran
          </Button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={copy}
              data-testid={`${testId}-copy`}><Copy className="mr-2 h-3.5 w-3.5" /> Copier le lien</Button>
            <Button type="button" size="sm" variant="outline" className="rounded-full" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer" data-testid={`${testId}-open`}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Aperçu
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
