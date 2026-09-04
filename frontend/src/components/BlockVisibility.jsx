import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const Ctx = createContext({ hidden: {}, reload: () => {} });

/** Visibilité des blocs par profil, pilotée par le Bureau (settings/block-visibility). */
export const BlockVisibilityProvider = ({ children }) => {
  const { user } = useAuth();
  const [hidden, setHidden] = useState({});
  const reload = () => api.get("/settings/block-visibility").then((r) => setHidden(r.data.hidden || {})).catch(() => {});
  useEffect(() => { if (user?.status === "ACTIVE") reload(); }, [user]);
  return <Ctx.Provider value={{ hidden, reload }}>{children}</Ctx.Provider>;
};

export const useBlockVisible = (key) => {
  const { user } = useAuth();
  const { hidden } = useContext(Ctx);
  if (!key || !user) return true;
  return !(hidden[key] || []).includes(user.role);
};

export const useBlockReload = () => useContext(Ctx).reload;

export const useBlockVisibleFn = () => {
  const { user } = useAuth();
  const { hidden } = useContext(Ctx);
  return useCallback((key) => !key || !user || !(hidden[key] || []).includes(user.role), [hidden, user]);
};

/** N'affiche l'enfant que si le bloc est visible pour le profil connecté (aucun espace vide sinon). */
export const VisibleBlock = ({ id, children }) => {
  const visible = useBlockVisible(id);
  return visible ? children : null;
};
