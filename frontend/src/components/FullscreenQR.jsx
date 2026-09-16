import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Minimize2 } from "lucide-react";

/** Vue plein écran d'un QR (fidélité ou carte de visite), lisible sans connexion. */
export const FullscreenQR = ({ value, title, subtitle, note, onClose }) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    const mountedAt = Date.now();
    const onFsChange = () => {
      if (Date.now() - mountedAt < 250) return;
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose();
  };

  return (
    <div ref={ref} data-testid="fullscreen-qr"
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-8 bg-black p-6 text-white">
      <button type="button" onClick={exit} data-testid="fullscreen-qr-exit" aria-label="Quitter le plein écran"
        className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/40 hover:text-white">
        <Minimize2 className="h-4 w-4" /> Quitter
      </button>
      <div className="rounded-2xl bg-white p-8 shadow-2xl">
        <QRCodeSVG value={value || ""} size={320} level="H" fgColor="#000000" bgColor="#ffffff"
          className="h-[min(78vw,360px)] w-[min(78vw,360px)]" data-testid="fullscreen-qr-code" />
      </div>
      <div className="text-center">
        {title && <p className="font-display text-3xl font-extrabold" data-testid="fullscreen-qr-title">{title}</p>}
        {subtitle && <p className="mt-2 text-lg text-white/60" data-testid="fullscreen-qr-subtitle">{subtitle}</p>}
        {note && <p className="mt-4 text-sm text-white/40">{note}</p>}
        <p className="mt-3 text-xs text-white/30">Contraste maximisé — augmentez la luminosité de votre écran pour un scan plus fiable.</p>
      </div>
    </div>
  );
};

export default FullscreenQR;
