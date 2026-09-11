import { useEffect, useState } from "react";
import { api } from "@/lib/api";

let cache = null;
const listeners = new Set();

/** Prompt 11 — Libellés de navigation configurables : overrides { libellé d'origine → nouveau }. */
export function useNavLabels() {
  const [labels, setLabels] = useState(cache || {});
  useEffect(() => {
    const l = (v) => setLabels(v);
    listeners.add(l);
    if (cache) setLabels(cache);
    else api.get("/nav-labels").then((r) => { cache = r.data.labels || {}; listeners.forEach((fn) => fn(cache)); }).catch(() => {});
    return () => listeners.delete(l);
  }, []);
  return labels;
}

export async function saveNavLabels(labels) {
  const { data } = await api.put("/nav-labels", { labels });
  cache = data.labels || {};
  listeners.forEach((fn) => fn(cache));
  return cache;
}
