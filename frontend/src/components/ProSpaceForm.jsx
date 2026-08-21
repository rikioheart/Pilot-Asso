import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Globe, Save, FileText } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SectionCard, Chip } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const EMPTY = { company_name: "", siret: "", specialties: "", formations: "", promo_code: "",
  advantage_note: "", website_url: "", public_summary: "", facebook: "", instagram: "",
  linkedin: "", document_file_ids: [], document_links: "" };

/** Espace professionnel qualifié : entreprise, SIRET, formations, spécialités, liens, documents. */
export const ProSpaceForm = () => {
  const { profile, refresh } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const space = profile?.pro_space;
    if (!space) return;
    setForm({
      ...EMPTY, ...space,
      specialties: (space.specialties || []).join(", "),
      formations: (space.formations || []).join(", "),
      document_links: (space.document_links || []).join(", "),
      document_file_ids: space.document_file_ids || [],
      facebook: space.social_links?.facebook || "",
      instagram: space.social_links?.instagram || "",
      linkedin: space.social_links?.linkedin || "",
    });
  }, [profile]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/profiles/me/pro-space", {
        company_name: form.company_name, siret: form.siret, promo_code: form.promo_code,
        advantage_note: form.advantage_note, website_url: form.website_url || null,
        public_summary: form.public_summary,
        specialties: form.specialties.split(",").map((s) => s.trim()).filter(Boolean),
        formations: form.formations.split(",").map((s) => s.trim()).filter(Boolean),
        document_links: form.document_links.split(",").map((s) => s.trim()).filter(Boolean),
        document_file_ids: form.document_file_ids,
        social_links: { facebook: form.facebook, instagram: form.instagram, linkedin: form.linkedin },
      });
      await refresh?.();
      toast.success("Espace professionnel mis à jour");
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  const text = (key, label, placeholder = "") => (
    <div>
      <Label>{label}</Label>
      <Input value={form[key]} placeholder={placeholder} data-testid={`pro-${key}-input`}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-6" data-testid="pro-space-form">
      <SectionCard title="Mon compte qualifié" icon={Briefcase} testId="pro-space-identity"
        subtitle="Ces informations constituent votre fiche professionnelle ou partenaire.">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("company_name", "Nom d'entreprise", "Ex. Éducanin Gâtinais")}
          {text("siret", "Numéro SIRET", "14 chiffres (facultatif)")}
          {text("specialties", "Spécialités (virgules)", "Éducation, comportement, sport canin")}
          {text("formations", "Formations associées (virgules)", "MFEC, ACACED, ostéopathie")}
          {text("promo_code", "Code promo réservé aux adhérents")}
          {text("advantage_note", "Avantage accordé", "Ex. -10 % sur la première séance")}
        </div>
        <div className="mt-4">
          <Label>Présentation visible par les membres</Label>
          <Textarea rows={3} value={form.public_summary} data-testid="pro-summary-input"
            onChange={(e) => setForm({ ...form, public_summary: e.target.value })} />
        </div>
      </SectionCard>

      <SectionCard title="Site & réseaux sociaux" icon={Globe} testId="pro-space-links">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("website_url", "Site internet", "https://")}
          {text("facebook", "Facebook", "https://")}
          {text("instagram", "Instagram", "https://")}
          {text("linkedin", "LinkedIn", "https://")}
        </div>
      </SectionCard>

      <SectionCard title="Contrat & clauses de partenariat" icon={FileText} testId="pro-space-documents"
        subtitle="Déposez un PDF ou renseignez un lien cliquable vers vos documents.">
        <FileUpload usage="OTHER" testId="pro-document-upload" label="Joindre un document"
          value={form.document_file_ids[0]}
          onChange={(id) => setForm({ ...form, document_file_ids: id ? [id] : [] })} />
        <div className="mt-4">
          <Label>Liens vers des documents (virgules)</Label>
          <Input value={form.document_links} placeholder="https://" data-testid="pro-document-links-input"
            onChange={(e) => setForm({ ...form, document_links: e.target.value })} />
        </div>
      </SectionCard>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy} data-testid="pro-space-save-button"
          className="rounded-full bg-[#800020] hover:bg-[#63001a]">
          <Save className="mr-2 h-4 w-4" /> {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Chip tone="muted">Visible selon les rôles autorisés</Chip>
      </div>
    </div>
  );
};

/** Description de fonction, soumise à validation du Bureau. */
export const FunctionDescription = () => {
  const { profile, user, refresh } = useAuth();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const status = profile?.function_description_status;

  useEffect(() => { setValue(profile?.function_description || ""); }, [profile]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/profiles/me/function-description", { function_description: value });
      await refresh?.();
      toast.success(user?.role === "ADMIN_BUREAU"
        ? "Description enregistrée" : "Description envoyée au Bureau pour validation");
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  const tone = { APPROVED: "green", PENDING: "amber", REJECTED: "red" }[status] || "muted";
  const label = { APPROVED: "Validée et visible", PENDING: "En attente de validation",
    REJECTED: "À revoir" }[status] || "Non renseignée";

  return (
    <SectionCard title="Ma fonction dans l'association" testId="function-description-card"
      subtitle="Décrivez en quelques lignes ce que vous faites concrètement au quotidien."
      actions={<Chip tone={tone} testId="function-description-status">{label}</Chip>}>
      <Textarea rows={4} value={value} maxLength={600} data-testid="function-description-input"
        placeholder="Ex. J'encadre les balades collectives du samedi et j'accompagne les nouveaux adhérents."
        onChange={(e) => setValue(e.target.value)} />
      {profile?.function_description_comment && (
        <p className="mt-2 text-xs text-[#800020]">Retour du Bureau : {profile.function_description_comment}</p>
      )}
      <Button onClick={save} disabled={busy || value.trim().length < 5} className="mt-4 rounded-full bg-[#002060] hover:bg-[#001740]"
        data-testid="function-description-save">Enregistrer ma description</Button>
    </SectionCard>
  );
};
