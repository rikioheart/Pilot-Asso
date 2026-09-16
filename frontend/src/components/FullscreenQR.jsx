import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Minimize2 } from "lucide-react";
import { themeColor } from "@/components/ThemeProvider";

/** Vue plein écran d'un QR (fidélité ou carte de visite), lisible sans connexion. */
export const FullscreenQR = ({ value, title, subtitle, note, onClose }) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    const onFsChange = () => { if (!document.fullscreenElement) onClose(); };
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
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-8 bg-[#0a1020] p-6 text-white">
      <button type="button" onClick={exit} data-testid="fullscreen-qr-exit" aria-label="Quitter le plein écran"
        className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/40 hover:text-white">
        <Minimize2 className="h-4 w-4" /> Quitter
      </button>
      <div className="rounded-3xl bg-white p-6 shadow-2xl">
        <QRCodeSVG value={value || ""} size={300} level="M" fgColor={themeColor("marine")}
          className="h-[min(70vw,320px)] w-[min(70vw,320px)]" data-testid="fullscreen-qr-code" />
      </div>
      <div className="text-center">
        {title && <p className="font-display text-3xl font-extrabold" data-testid="fullscreen-qr-title">{title}</p>}
        {subtitle && <p className="mt-2 text-lg text-white/60" data-testid="fullscreen-qr-subtitle">{subtitle}</p>}
        {note && <p className="mt-4 text-sm text-white/40">{note}</p>}
      </div>
    </div>
  );
};

export default FullscreenQR;
