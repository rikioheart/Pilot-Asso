import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { apiError, fileUrl, uploadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** Envoi d'un fichier (image, PDF, document) vers le stockage de la plateforme. */
export const FileUpload = ({ usage = "OTHER", value, onChange, label = "Ajouter un fichier",
  accept, preview = false, testId = "file-upload" }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const pick = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const data = await uploadFile(file, usage);
      setName(data.original_filename);
      onChange?.(data.file_id, data);
      toast.success("Fichier ajouté");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <input ref={inputRef} type="file" accept={accept} onChange={pick} className="hidden"
        data-testid={`${testId}-input`} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}
          className="rounded-full" data-testid={`${testId}-button`}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {busy ? "Envoi…" : label}
        </Button>
        {value && (
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-[#002060]">
            <Paperclip className="h-3 w-3" /> {name || "Fichier joint"}
            <button type="button" onClick={() => { setName(""); onChange?.(null); }}
              data-testid={`${testId}-clear`} aria-label="Retirer le fichier">
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      {preview && value && (
        <img src={fileUrl(value)} alt="Aperçu" data-testid={`${testId}-preview`}
          className="h-28 w-full max-w-xs rounded-lg border object-cover" />
      )}
      <p className="text-xs text-muted-foreground">Images 6 Mo max · PDF et documents 20 Mo max.</p>
    </div>
  );
};

export default FileUpload;
