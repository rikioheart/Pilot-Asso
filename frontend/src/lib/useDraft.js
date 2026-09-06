import { useEffect, useRef } from "react";

const PREFIX = "vdc_draft_";
const WEEK = 7 * 24 * 3600 * 1000;

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > WEEK) { localStorage.removeItem(PREFIX + key); return null; }
    return data;
  } catch { return null; }
}

export function clearDraft(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}

/** Sauvegarde silencieuse d'un brouillon toutes les 30 s (uniquement si non vide). */
export function useAutoSaveDraft(key, value) {
  const ref = useRef(value);
  ref.current = value;
  useEffect(() => {
    const id = setInterval(() => {
      const v = ref.current;
      const filled = typeof v === "string" ? v.trim() : v && Object.keys(v).length;
      if (filled) {
        try { localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data: v })); } catch { /* noop */ }
      }
    }, 30000);
    return () => clearInterval(id);
  }, [key]);
}
