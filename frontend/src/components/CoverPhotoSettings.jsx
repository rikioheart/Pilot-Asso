import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ConfirmDialog";

export function CoverPhotoSettings() {
  const [fileId, setFileId] = useState(null);
  const load = () => api.get("/settings/cover-photo").then((r) => setFileId(r.data.file_id || null)).catch(() => {});
  useEffect(() => { load(); }, []);

  const set = async (id) => {
    try { await api.put("/settings/cover-photo", { file_id: id }); setFileId(id); toast.success("Photo de couverture mise à jour"); }
    catch (e) { toast.error(apiError(e)); }
  };
  const remove = async () => {
    if (!(await confirmDialog("Retirer la photo de couverture ?"))) return;
    await set(null);
  };

  return (
    <SectionCard title="Photo de couverture" icon={ImageIcon} testId="cover-photo-card" className="mb-6"
      subtitle="Affichée en haut du tableau de bord pour tous les profils. Compression automatique à l'envoi.">
      {fileId && (
        <img src={fileUrl(fileId)} alt="Couverture" className="mb-3 h-40 w-full rounded-xl border object-cover"
          data-testid="cover-photo-preview" />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <FileUpload usage="OTHER" accept="image/*" compress label="Choisir une photo de couverture"
          testId="cover-photo-upload" onChange={(id) => set(id)} />
        {fileId && <Button variant="outline" className="rounded-full" data-testid="cover-photo-remove" onClick={remove}>Retirer</Button>}
      </div>
    </SectionCard>
  );
}
