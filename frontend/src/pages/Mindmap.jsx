import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Plus, Link2, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const nodeStyle = (node) => ({
  background: node.node_type === "ROOT" ? "var(--bordeaux)" : "#ffffff",
  color: node.node_type === "ROOT" ? "#ffffff" : "var(--marine)",
  border: `2px solid ${node.color || "var(--marine)"}`,
  borderRadius: node.node_type === "ROOT" ? 999 : 12,
  padding: node.node_type === "ROOT" ? "18px 26px" : "10px 14px",
  fontWeight: node.node_type === "ROOT" ? 800 : 600,
  fontSize: node.node_type === "ROOT" ? 15 : 12,
  fontFamily: "Plus Jakarta Sans, sans-serif",
  minWidth: 130,
  textAlign: "center",
  boxShadow: "0 6px 18px rgba(0,32,96,0.08)",
});

export default function Mindmap() {
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [raw, setRaw] = useState({ nodes: [], projects: [], can_edit: false });
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ label: "", color: "var(--marine)", link: "", project_id: "", progress: 0 });
  const [dirty, setDirty] = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/mindmap");
      setRaw(data);
      setNodes(data.nodes.map((n) => ({
        id: n.node_id,
        position: { x: n.x, y: n.y },
        data: { label: n.progress ? `${n.label} · ${n.progress}%` : n.label, node: n },
        style: nodeStyle(n),
        draggable: data.can_edit,
      })));
      setEdges(data.edges.map((e) => ({
        id: e.edge_id, source: e.source, target: e.target, animated: false,
        style: { stroke: "var(--bordeaux)55", strokeWidth: 2 },
      })));
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [setNodes, setEdges]);

  useEffect(() => { load(); }, [load]);

  const projectsByCategory = useMemo(() => {
    const map = {};
    raw.projects.forEach((p) => {
      map[p.category] = map[p.category] || [];
      map[p.category].push(p);
    });
    return map;
  }, [raw.projects]);

  const onNodeClick = (_, node) => {
    const source = node.data.node;
    setSelected(source);
    if (source.link) navigate(source.link);
    else if (source.project_id) navigate(`/projects/${source.project_id}`);
  };

  const onNodeDragStop = (_, node) => {
    if (!raw.can_edit) return;
    setDirty({ ...dirty, [node.id]: { x: Math.round(node.position.x), y: Math.round(node.position.y) } });
  };

  const savePositions = async () => {
    try {
      await Promise.all(Object.entries(dirty).map(([nodeId, pos]) => api.put(`/mindmap/nodes/${nodeId}`, pos)));
      setDirty({});
      toast.success("Positions enregistrées");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const createNode = async (e) => {
    e.preventDefault();
    try {
      await api.post("/mindmap/nodes", {
        label: form.label, node_type: "NODE", color: form.color,
        link: form.link || null, project_id: form.project_id || null,
        progress: Number(form.progress) || 0,
        parent_id: selected?.node_id || raw.nodes.find((n) => n.node_type === "ROOT")?.node_id,
        x: (selected?.x || 0) + 180, y: (selected?.y || 0) + 120, visibility: "MEMBERS",
      });
      toast.success("Nœud ajouté");
      setDialog(null);
      setForm({ label: "", color: "var(--marine)", link: "", project_id: "", progress: 0 });
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const attachProject = async (projectId) => {
    if (!selected) return;
    try {
      await api.put(`/mindmap/nodes/${selected.node_id}`, { project_id: projectId });
      toast.success("Projet associé au nœud");
      setDialog(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="mindmap-page">
      <PageHeader breadcrumb="Vision d'ensemble" title="Mindmap de l'association"
        subtitle="Cliquez un nœud pour ouvrir la section correspondante. Chaque branche montre où nous allons."
        actions={raw.can_edit && (
          <div className="flex flex-wrap gap-2">
            {Object.keys(dirty).length > 0 && (
              <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]" onClick={savePositions}
                data-testid="mindmap-save-positions">
                <Save className="mr-2 h-4 w-4" /> Enregistrer les positions
              </Button>
            )}
            <Button size="sm" variant="outline" className="rounded-full" data-testid="mindmap-attach-project"
              onClick={() => setDialog("project")} disabled={!selected}>
              <Link2 className="mr-2 h-4 w-4" /> Associer un projet
            </Button>
            <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="mindmap-add-node"
              onClick={() => setDialog("node")}>
              <Plus className="mr-2 h-4 w-4" /> Ajouter un nœud
            </Button>
          </div>
        )} />

      {selected && (
        <p className="mb-3 text-sm text-muted-foreground" data-testid="mindmap-selected">
          Nœud sélectionné : <b className="text-[var(--marine)]">{selected.label}</b>
          {selected.project_id && " · projet associé"}
        </p>
      )}

      {nodes.length === 0 ? (
        <EmptyState testId="mindmap-empty" title="Mindmap vide" description="La carte se génère au premier chargement." />
      ) : (
        <div className="h-[32rem] overflow-hidden rounded-xl border bg-card sm:h-[38rem]" data-testid="mindmap-canvas">
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick} onNodeDragStop={onNodeDragStop} fitView
            proOptions={{ hideAttribution: true }} minZoom={0.2}>
            <Background color="var(--bordeaux)20" gap={22} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="hidden sm:block"
              nodeColor={(n) => n.data?.node?.color || "var(--marine)"} />
          </ReactFlow>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="mindmap-legend">
        {Object.entries(projectsByCategory).map(([category, list]) => (
          <div key={category} className="rounded-xl border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{category}</p>
            <div className="mt-2 space-y-1">
              {list.slice(0, 4).map((p) => (
                <button key={p.project_id} onClick={() => navigate(`/projects/${p.project_id}`)}
                  data-testid={`mindmap-project-${p.project_id}`}
                  className="block w-full truncate text-left text-sm text-[var(--marine)] hover:text-[var(--bordeaux)]">
                  {p.title} · {p.completion_percentage}%
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent data-testid="mindmap-dialog">
          <DialogHeader>
            <DialogTitle>{dialog === "node" ? "Ajouter un nœud" : "Associer un projet au nœud"}</DialogTitle>
          </DialogHeader>
          {dialog === "node" ? (
            <form onSubmit={createNode} className="space-y-4">
              <div className="space-y-2">
                <Label>Libellé *</Label>
                <Input required value={form.label} data-testid="mindmap-node-label"
                  onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Couleur</Label>
                  <Input type="color" value={form.color} data-testid="mindmap-node-color"
                    onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Progression (%)</Label>
                  <Input type="number" min="0" max="100" value={form.progress} data-testid="mindmap-node-progress"
                    onChange={(e) => setForm({ ...form, progress: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Lien interne (ex. /projects)</Label>
                <Input value={form.link} data-testid="mindmap-node-link"
                  onChange={(e) => setForm({ ...form, link: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Projet associé</Label>
                <Select value={form.project_id || "NONE"}
                  onValueChange={(v) => setForm({ ...form, project_id: v === "NONE" ? "" : v })}>
                  <SelectTrigger data-testid="mindmap-node-project"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Aucun</SelectItem>
                    {raw.projects.map((p) => (
                      <SelectItem key={p.project_id} value={p.project_id} data-testid={`mindmap-node-project-${p.project_id}`}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Le nœud sera rattaché à {selected ? `« ${selected.label} »` : "la racine"}.
              </p>
              <DialogFooter>
                <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                  data-testid="mindmap-node-save">Ajouter</Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-2">
              {raw.projects.map((p) => (
                <button key={p.project_id} onClick={() => attachProject(p.project_id)}
                  data-testid={`mindmap-attach-${p.project_id}`}
                  className="w-full rounded-lg border px-4 py-2 text-left text-sm transition-colors hover:border-[var(--bordeaux-a40)] hover:bg-muted/50">
                  {p.title}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
