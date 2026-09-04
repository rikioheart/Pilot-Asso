import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { applySession, refresh } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const sessionId = new URLSearchParams(window.location.hash.replace("#", "")).get("session_id");
    (async () => {
      try {
        const { data } = await api.post("/auth/session", {}, { headers: { "X-Session-ID": sessionId } });
        applySession(data);
        window.history.replaceState({}, "", "/");
        await refresh();
        navigate("/", { replace: true });
      } catch {
        navigate("/login?error=google", { replace: true });
      }
    })();
  }, [applySession, navigate, refresh]);

  return (
    <div className="min-h-screen grid place-items-center bg-[var(--marine)] text-white" data-testid="auth-callback">
      Connexion en cours…
    </div>
  );
}
