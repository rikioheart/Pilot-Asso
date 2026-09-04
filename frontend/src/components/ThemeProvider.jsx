import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/lib/api";

export const THEMES = {
  T1: {
    label: "Clair (défaut)", dark: false,
    vars: { "--bordeaux": "#800020", "--bordeaux-dark": "#63001a", "--marine": "#002060",
      "--surface": "#ffffff", "--surface-alt": "#f4f6f8",
      "--status-ok": "#1e7f4f", "--status-warn": "#c2701a", "--status-error": "#b3261e" },
    hsl: { background: "210 20% 98%", foreground: "222 47% 11%", card: "0 0% 100%",
      "card-foreground": "222 47% 11%", popover: "0 0% 100%", "popover-foreground": "222 47% 11%",
      muted: "210 20% 96%", "muted-foreground": "215 16% 40%", border: "214 32% 91%",
      input: "214 32% 91%", primary: "345 100% 25%", "primary-foreground": "0 0% 100%",
      secondary: "222 100% 19%", ring: "345 100% 25%" },
  },
  T2: {
    label: "Bordeaux", dark: false,
    vars: { "--bordeaux": "#002060", "--bordeaux-dark": "#001845", "--marine": "#800020",
      "--surface": "#ffffff", "--surface-alt": "#f7ecef",
      "--status-ok": "#1e7f4f", "--status-warn": "#c2701a", "--status-error": "#b3261e" },
    hsl: { background: "345 42% 95%", foreground: "222 47% 11%", card: "0 0% 100%",
      "card-foreground": "222 47% 11%", popover: "0 0% 100%", "popover-foreground": "222 47% 11%",
      muted: "345 26% 92%", "muted-foreground": "215 16% 40%", border: "345 26% 86%",
      input: "345 26% 86%", primary: "222 100% 19%", "primary-foreground": "0 0% 100%",
      secondary: "345 100% 25%", ring: "222 100% 19%" },
  },
  T3: {
    label: "Sombre", dark: true,
    vars: { "--bordeaux": "#c14b6c", "--bordeaux-dark": "#9a3352", "--marine": "#e8ecf5",
      "--surface": "#0b1836", "--surface-alt": "#070f24",
      "--status-ok": "#48c78e", "--status-warn": "#f0a44a", "--status-error": "#f26d6d" },
    hsl: { background: "222 55% 9%", foreground: "210 40% 96%", card: "222 45% 14%",
      "card-foreground": "210 40% 96%", popover: "222 45% 14%", "popover-foreground": "210 40% 96%",
      muted: "222 30% 20%", "muted-foreground": "214 20% 72%", border: "222 25% 26%",
      input: "222 25% 26%", primary: "340 52% 55%", "primary-foreground": "0 0% 100%",
      secondary: "210 40% 96%", ring: "340 52% 55%" },
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
  setUserTheme: () => {}, reload: () => {} });

export const ThemeProvider = ({ children }) => {
  const [bureauKey, setBureauKey] = useState("T1");
  const [userKey, setUserKey] = useState(() => localStorage.getItem("vdc_user_theme") || null);
  const themeKey = userKey || bureauKey;

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

  return (
    <ThemeContext.Provider value={{ themeKey, userKey, bureauKey, setUserTheme, reload }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
