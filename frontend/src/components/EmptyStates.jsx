import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const Ctx = createContext({ messages: {}, reload: () => {} });

/** Messages d'états vides rédigés par le Bureau, par module et par profil. */
export const EmptyStatesProvider = ({ children }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState({});
  const reload = () => api.get("/settings/empty-states").then((r) => setMessages(r.data.messages || {})).catch(() => {});
  useEffect(() => { if (user?.status === "ACTIVE") reload(); }, [user]);
  return <Ctx.Provider value={{ messages, reload }}>{children}</Ctx.Provider>;
};

export const useEmptyMessage = (module) => {
  const { user } = useAuth();
  const { messages } = useContext(Ctx);
  const entry = module && user ? messages?.[module]?.[user.role] : null;
  return entry?.message ? entry : null;
};
