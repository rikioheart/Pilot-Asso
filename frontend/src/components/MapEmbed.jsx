import { useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MapEmbed({ address, testId = "map" }) {
  const [open, setOpen] = useState(false);
  if (!address) return null;
  const q = encodeURIComponent(address);
  const embedSrc = `https://www.google.com/maps?q=${q}&output=embed`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

  return (
    <div className="space-y-2" data-testid={`${testId}-embed`}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" data-testid={`${testId}-toggle`}
          onClick={() => setOpen((o) => !o)}>
          <MapPin className="mr-1 h-3.5 w-3.5" /> {open ? "Masquer la carte" : "Voir la carte"}
        </Button>
        <a href={directions} target="_blank" rel="noreferrer" data-testid={`${testId}-directions`}
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold text-[var(--marine)] hover:bg-muted">
          <Navigation className="h-3.5 w-3.5" /> Itinéraire
        </a>
      </div>
      {open && (
        <iframe title="Carte" src={embedSrc} loading="lazy" data-testid={`${testId}-iframe`}
          className="h-64 w-full rounded-lg border" referrerPolicy="no-referrer-when-downgrade" />
      )}
    </div>
  );
}
