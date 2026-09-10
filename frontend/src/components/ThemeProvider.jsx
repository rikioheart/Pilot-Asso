import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/lib/api";

// Nuances décoratives (Prompt 10) : Gris Anthracite (texte/fonds secondaires), Sable Chaud & Vert Sauge (ornements)
const DECOR_LIGHT = { "--anthracite": "#2b2f36", "--sable": "#e6d2ad", "--sauge": "#93a982" };
const DECOR_DARK = { "--anthracite": "#c9d0dd", "--sable": "#c9b487", "--sauge": "#8ba579" };

export const THEMES = {
  T1: {
    label: "Clair (défaut)", dark: false,
    vars: { "--bordeaux": "#800020", "--bordeaux-dark": "#63001a", "--marine": "#002060",
      "--surface": "#ffffff", "--surface-alt": "#f4f6f8",
      "--status-ok": "#1e7f4f", "--status-warn": "#c2701a", "--status-error": "#c2571a", ...DECOR_LIGHT },
    hsl: { background: "210 20% 98%", foreground: "216 14% 19%", card: "0 0% 100%",
      "card-foreground": "216 14% 19%", popover: "0 0% 100%", "popover-foreground": "216 14% 19%",
      muted: "210 20% 96%", "muted-foreground": "215 16% 40%", border: "214 32% 91%",
      input: "214 32% 91%", primary: "345 100% 25%", "primary-foreground": "0 0% 100%",
      secondary: "222 100% 19%", ring: "345 100% 25%" },
  },
  T2: {
    label: "Bordeaux", dark: false,
    vars: { "--bordeaux": "#002060", "--bordeaux-dark": "#001845", "--marine": "#800020",
      "--surface": "#ffffff", "--surface-alt": "#f7ecef",
      "--status-ok": "#1e7f4f", "--status-warn": "#c2701a", "--status-error": "#c2571a", ...DECOR_LIGHT },
    hsl: { background: "345 42% 95%", foreground: "216 14% 19%", card: "0 0% 100%",
      "card-foreground": "216 14% 19%", popover: "0 0% 100%", "popover-foreground": "216 14% 19%",
      muted: "345 26% 92%", "muted-foreground": "215 16% 40%", border: "345 26% 86%",
      input: "345 26% 86%", primary: "222 100% 19%", "primary-foreground": "0 0% 100%",
      secondary: "345 100% 25%", ring: "222 100% 19%" },
  },
  T3: {
    label: "Sombre", dark: true,
    vars: { "--bordeaux": "#d06b86", "--bordeaux-dark": "#b04d69", "--marine": "#eaeefb",
      "--surface": "#141a2e", "--surface-alt": "#0e1424",
      "--status-ok": "#4fd0a0", "--status-warn": "#f0ad57", "--status-error": "#f07777", ...DECOR_DARK },
    hsl: { background: "224 32% 10%", foreground: "213 30% 92%", card: "223 27% 15%",
      "card-foreground": "213 30% 92%", popover: "223 27% 15%", "popover-foreground": "213 30% 92%",
      muted: "223 20% 21%", "muted-foreground": "214 16% 70%", border: "223 18% 27%",
      input: "223 18% 27%", primary: "342 55% 62%", "primary-foreground": "0 0% 100%",
      secondary: "213 30% 92%", ring: "342 55% 62%" },
  },
};
export const DEFAULT_THEME_KEY = "T1";

export const applyTheme = (key) => {
  const t = THEMES[key] || THEMES.T1;
  const root = document.documentElement;
  Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  Object.entries(t.hsl).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
  root.classList.toggle("dark", !!t.dark);
};

export const themeColor = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || "#800020";

const ThemeContext = createContext({ themeKey: "T1", userKey: null, bureauKey: "T1",
  setUserTheme: () => {}, reload: () => {}, textSize: 16, setTextSize: () => {},
  animationsOff: false, setAnimationsOff: () => {} });

export const ThemeProvider = ({ children }) => {
  const [bureauKey, setBureauKey] = useState("T1");
  const [userKey, setUserKey] = useState(() => localStorage.getItem("vdc_user_theme") || null);
  const themeKey = userKey || bureauKey;
  const [textSize, setTextSizeState] = useState(() => Number(localStorage.getItem("vdc_text_size")) || 16);
  const [animationsOff, setAnimOffState] = useState(() => localStorage.getItem("vdc_animations_off") === "1");

  const setTextSize = useCallback((n) => {
    const v = Math.min(24, Math.max(14, Number(n) || 16));
    localStorage.setItem("vdc_text_size", String(v)); setTextSizeState(v);
  }, []);
  const setAnimationsOff = useCallback((v) => {
    localStorage.setItem("vdc_animations_off", v ? "1" : "0"); setAnimOffState(!!v);
  }, []);

  const reload = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/settings/theme`);
      setBureauKey(THEMES[data.theme_key] ? data.theme_key : "T1");
    } catch { /* défaut conservé */ }
  }, []);

  const setUserTheme = useCallback((key) => {
    if (key && THEMES[key]) { localStorage.setItem("vdc_user_theme", key); setUserKey(key); }
    else { localStorage.removeItem("vdc_user_theme"); setUserKey(null); }
  }, []);

  useEffect(() => { applyTheme(themeKey); }, [themeKey]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { document.documentElement.style.fontSize = `${textSize}px`; }, [textSize]);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.toggle("reduce-motion", animationsOff || reduce);
  }, [animationsOff]);

  return (
    <ThemeContext.Provider value={{ themeKey, userKey, bureauKey, setUserTheme, reload,
      textSize, setTextSize, animationsOff, setAnimationsOff }}>
      <style>{`.reduce-motion *,.reduce-motion *::before,.reduce-motion *::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}`}</style>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
