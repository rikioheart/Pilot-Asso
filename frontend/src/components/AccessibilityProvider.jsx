import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const DEFAULTS = { font: "DEFAULT", text_size: "NORMAL", spacing: "NORMAL",
  contrast: "NORMAL", focus_mode: false, reduce_motion: false };

/** Applique les préférences d'accessibilité du profil à toute la plateforme. */
export const AccessibilityProvider = ({ children }) => {
  const { profile } = useAuth();

  useEffect(() => {
    const prefs = { ...DEFAULTS, ...(profile?.accessibility || {}) };
    const root = document.documentElement;
    root.dataset.font = prefs.font.toLowerCase();
    root.dataset.textSize = prefs.text_size.toLowerCase();
    root.dataset.spacing = prefs.spacing.toLowerCase();
    root.dataset.contrast = prefs.contrast.toLowerCase();
    root.dataset.focus = prefs.focus_mode ? "on" : "off";
    root.dataset.motion = prefs.reduce_motion ? "reduced" : "full";
  }, [profile]);

  return children;
};

export default AccessibilityProvider;
