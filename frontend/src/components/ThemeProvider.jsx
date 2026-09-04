import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/lib/api";

export const DEFAULT_THEME = {
  primary: "#800020", primary_dark: "#63001a", dark: "#002060",
  surface: "#ffffff", surface_alt: "#f4f6f8",
  status_ok: "#1e7f4f", status_warn: "#c2701a", status_error: "#b3261e",
};

const hexToHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const applyTheme = (t) => {
  const root = document.documentElement.style;
  root.setProperty("--bordeaux", t.primary);
  root.setProperty("--bordeaux-dark", t.primary_dark);
  root.setProperty("--marine", t.dark);
  root.setProperty("--surface", t.surface);
  root.setProperty("--surface-alt", t.surface_alt);
  root.setProperty("--status-ok", t.status_ok);
  root.setProperty("--status-warn", t.status_warn);
  root.setProperty("--status-error", t.status_error);
  root.setProperty("--primary", hexToHsl(t.primary));
  root.setProperty("--ring", hexToHsl(t.primary));
  root.setProperty("--secondary", hexToHsl(t.dark));
  root.setProperty("--accent-foreground", hexToHsl(t.dark));
  root.setProperty("--card", hexToHsl(t.surface));
  root.setProperty("--popover", hexToHsl(t.surface));
  root.setProperty("--background", hexToHsl(t.surface_alt));
  root.setProperty("--destructive", hexToHsl(t.status_error));
};

/** Couleur de la charte résolue (utile pour canvas / exports). */
export const themeColor = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || DEFAULT_THEME.primary;

const ThemeContext = createContext({ theme: DEFAULT_THEME, reload: () => {} });

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem("vdc_theme") || "{}") }; }
    catch { return DEFAULT_THEME; }
  });

  const reload = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/settings/theme`);
      const next = { ...DEFAULT_THEME, ...data };
      localStorage.setItem("vdc_theme", JSON.stringify(next));
      setTheme(next);
    } catch { /* thème local conservé */ }
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { reload(); }, [reload]);

  return <ThemeContext.Provider value={{ theme, reload }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
