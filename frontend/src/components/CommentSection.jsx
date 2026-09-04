import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Send, Trash2, AtSign, Lock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { confirmDialog } from "@/components/ConfirmDialog";

const PAGE = 20;
const VIS_LABELS = { TOUS: "Tous les membres", PROS_BUREAU: "Pros + Bureau" };

export function CommentSection({ elementType, elementId, testId = "comments" }) {
  const { user } = useAuth();
  const isProOrBureau = ["ADMIN_BUREAU", "PROFESSIONNEL"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [canModerate, setCanModerate] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState("TOUS");
  const [mentionable, setMentionable] = useState([]);
  const [mentions, setMentions] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/comments", { params: { element_type: elementType, element_id: elementId, skip: 0, limit } });
      setItems(data.items);
      setTotal(data.total);
      setCanModerate(data.can_moderate);
    } catch (e) { toast.error(apiError(e)); }
  }, [elementType, elementId, limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/comments/mentionable", { params: { element_type: elementType, element_id: elementId } })
      .then((r) => setMentionable(r.data.items || [])).catch(() => {});
  }, [elementType, elementId]);

  const toggleMention = (uid) =>
    setMentions((m) => (m.includes(uid) ? m.filter((x) => x !== uid) : [...m, uid]));

  const post = async () => {
    if (!text.trim()) return;
    try {
      await api.post("/comments", { element_type: elementType, element_id: elementId, text, visibility, mentions });
      setText(""); setMentions([]); setVisibility("TOUS");
      toast.success("Commentaire publié");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (id) => {
    if (!(await confirmDialog("Supprimer ce commentaire ?"))) return;
    try { await api.delete(`/comments/${id}`); toast.success("Commentaire supprimé"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="rounded-xl border bg-card p-5" data-testid={`${testId}-section`}>
      <h3 className="flex items-center gap-2 font-display text-base md:text-lg font-bold text-[var(--marine)]">
        <MessageSquare className="h-4 w-4" /> Commentaires {total > 0 && <span className="text-sm text-muted-foreground">({total})</span>}
      </h3>

      <div className="mt-4 space-y-3">
        <Textarea rows={3} value={text} placeholder="Écrire un commentaire…" data-testid={`${testId}-input`}
          onChange={(e) => setText(e.target.value)} />
        {mentionable.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid={`${testId}-mentions`}>
            <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
            {mentionable.map((m) => (
              <button key={m.user_id} type="button" data-testid={`${testId}-mention-${m.user_id}`}
                onClick={() => toggleMention(m.user_id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${mentions.includes(m.user_id)
                  ? "border-[var(--bordeaux)] bg-[var(--bordeaux)] text-white"
                  : "text-muted-foreground hover:border-[var(--bordeaux-a40)]"}`}>
                {m.display_name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isProOrBureau ? (
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="h-9 w-48" data-testid={`${testId}-visibility`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(VIS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} data-testid={`${testId}-visibility-${k}`}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : <span className="text-xs text-muted-foreground">Visible par tous les membres</span>}
          <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
            data-testid={`${testId}-submit`} onClick={post}>
            <Send className="mr-1 h-3.5 w-3.5" /> Publier
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3" data-testid={`${testId}-list`}>
        {items.length === 0 && <p className="text-sm text-muted-foreground">Aucun commentaire pour le moment.</p>}
        {items.map((c) => (
          <div key={c.comment_id} className="rounded-lg border bg-muted/30 p-3" data-testid={`${testId}-item-${c.comment_id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--marine)]">{c.author_name}</span>
                <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("fr-FR")}</span>
                {c.visibility === "PROS_BUREAU" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bordeaux-a10)] px-2 py-0.5 text-xs text-[var(--bordeaux)]">
                    <Lock className="h-3 w-3" /> Pros + Bureau
                  </span>
                )}
              </div>
              {(canModerate || c.author_id === user?.user_id) && (
                <button onClick={() => remove(c.comment_id)} data-testid={`${testId}-delete-${c.comment_id}`}
                  className="text-muted-foreground hover:text-[var(--bordeaux)]"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{c.text}</p>
            {(c.mentions || []).length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {c.mentions.map((uid) => "@" + (mentionable.find((m) => m.user_id === uid)?.display_name || "membre")).join(" ")}
              </p>
            )}
          </div>
        ))}
        {total > items.length && (
          <Button variant="outline" size="sm" className="rounded-full" data-testid={`${testId}-load-more`}
            onClick={() => setLimit((l) => l + PAGE)}>Voir plus</Button>
        )}
      </div>
    </div>
  );
}
