import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";

export function CoverBanner() {
  const [fileId, setFileId] = useState(null);
  useEffect(() => {
    api.get("/settings/cover-photo").then((r) => setFileId(r.data.file_id || null)).catch(() => {});
  }, []);
  if (!fileId) return null;
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border" data-testid="cover-banner">
      <img src={fileUrl(fileId)} alt="Couverture de l'association"
        className="h-40 w-full object-cover sm:h-56" />
    </div>
  );
}
