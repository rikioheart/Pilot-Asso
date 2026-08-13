import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setProfile(data.profile);
      return data.user;
    } catch {
      setUser(false);
      setProfile(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: returning from OAuth callback -> AuthCallback exchanges session_id first
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const applySession = (data) => {
    if (data.access_token) localStorage.setItem("vdc_token", data.access_token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* noop */
    }
    localStorage.removeItem("vdc_token");
    setUser(false);
    setProfile(null);
  };

  const can = (permission) => !!user?.permissions?.includes(permission);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refresh, applySession, logout, can, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
