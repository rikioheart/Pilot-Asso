import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { FileUpload } from "@/components/FileUpload";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const toList = (value) => (value || "").split(",").map((s) => s.trim()).filter(Boolean);

export default function Profile() {
  const { user, profile, setProfile } = useAuth();
  const [form, setForm] = useState({});
  const [dogs, setDogs] = useState([]);
  const [newDog, setNewDog] = useState({ name: "", breed: "", character: "" });
  const [pro, setPro] = useState(null);
  const [categories, setCategories] = useState([]);

  const isPro = user?.role === "PROFESSIONNEL" || user?.role === "ADMIN_BUREAU";

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || "", last_name: profile.last_name || "",
        phone: profile.phone || "", city: profile.city || "",
        department: profile.department || "", bio: profile.bio || "",
      });
    }
  }, [profile]);

  useEffect(() => {
    if (user?.status !== "ACTIVE") return;
    if (user.role === "PARTICULIER") api.get("/dogs").then((r) => setDogs(r.data)).catch(() => {});
    if (isPro) {
      api.get("/professionals/me").then((r) => setPro({
        ...r.data,
        specialties_text: (r.data.specialties || []).join(", "),
        services_text: (r.data.services || []).join(", "),
        departments_text: (r.data.departments || []).join(", "),
        secondary_text: (r.data.secondary_categories || []).join(", "),
      })).catch(() => {});
      api.get("/professionals/meta/categories").then((r) => setCategories(r.data.categories)).catch(() => {});
    }
  }, [user, isPro]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.put("/profiles/me", form);
      setProfile(data);
      toast.success("Profil mis à jour");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const savePro = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        company_name: pro.company_name || null,
        professional_category: pro.professional_category || null,
        secondary_categories: toList(pro.secondary_text),
        description: pro.description || null,
        specialties: toList(pro.specialties_text),
        services: toList(pro.services_text),
        service_area: pro.service_area || null,
        departments: toList(pro.departments_text),
        website: pro.website || null,
        social_links: pro.social_links || {},
        phone: pro.phone || null,
        email: pro.email || null,
        member_advantages: pro.member_advantages || null,
        public_visibility: pro.public_visibility || "MEMBERS",
      };
      const { data } = await api.put("/professionals/me", payload);
      setPro({ ...pro, ...data });
      toast.success("Fiche professionnelle enregistrée");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const addDog = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/dogs", newDog);
      setDogs([...dogs, data]);
      setNewDog({ name: "", breed: "", character: "" });
      toast.success("Chien ajouté");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const removeDog = async (id) => {
    try {
      await api.delete(`/dogs/${id}`);
      setDogs(dogs.filter((d) => d.dog_id !== id));
      toast.success("Chien supprimé");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div data-testid="profile-page">
      <PageHeader breadcrumb="Mon espace" title="Mon profil"
        subtitle={`${user?.role} · ${user?.access_level} · statut ${user?.status}`} />

      <Tabs defaultValue="infos" className="max-w-3xl">
        <TabsList data-testid="profile-tabs" className="flex-wrap">
          <TabsTrigger value="infos" data-testid="profile-tab-infos">Informations</TabsTrigger>
          {isPro && <TabsTrigger value="pro" data-testid="profile-tab-pro">Ma fiche pro</TabsTrigger>}
          {user?.role === "PARTICULIER" && <TabsTrigger value="dogs" data-testid="profile-tab-dogs">Mes chiens</TabsTrigger>}
          <TabsTrigger value="rights" data-testid="profile-tab-rights">Mes droits</TabsTrigger>
        </TabsList>

        <TabsContent value="infos" className="mt-6">
          <form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-5" data-testid="profile-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input value={form.first_name || ""} data-testid="profile-firstname-input"
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={form.last_name || ""} data-testid="profile-lastname-input"
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={form.phone || ""} data-testid="profile-phone-input"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input value={form.city || ""} data-testid="profile-city-input"
                  onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Département</Label>
                <Input value={form.department || ""} data-testid="profile-department-input"
                  onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Photo de profil</Label>
              <div className="flex items-center gap-4">
                {form.avatar && (
                  <img src={form.avatar} alt="Ma photo" data-testid="profile-avatar-preview"
                    className="h-16 w-16 rounded-full border object-cover" />
                )}
                <FileUpload usage="AVATAR" accept="image/*" testId="profile-avatar-upload"
                  label="Choisir une photo" value={form.avatar_file_id}
                  onChange={(id) => setForm({ ...form, avatar_file_id: id,
                    avatar: id ? fileUrl(id) : null })} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Présentation</Label>
              <Textarea rows={4} value={form.bio || ""} data-testid="profile-bio-input"
                onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <Button type="submit" data-testid="profile-save-button" className="rounded-full bg-[#800020] hover:bg-[#63001a]">
              Enregistrer
            </Button>
          </form>
        </TabsContent>

        {isPro && (
          <TabsContent value="pro" className="mt-6">
            {!pro ? <p className="text-muted-foreground">Chargement de la fiche…</p> : (
              <form onSubmit={savePro} className="space-y-4 rounded-xl border bg-card p-5" data-testid="pro-details-form">
                <p className="text-sm text-muted-foreground">
                  Cette fiche alimente l'annuaire des professionnels. Séparez les listes par des virgules.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nom de la structure</Label>
                    <Input value={pro.company_name || ""} data-testid="pro-company-input"
                      onChange={(e) => setPro({ ...pro, company_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Catégorie principale</Label>
                    <Select value={pro.professional_category || "NONE"}
                      onValueChange={(v) => setPro({ ...pro, professional_category: v === "NONE" ? null : v })}>
                      <SelectTrigger data-testid="pro-category-select"><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Non précisée</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c} data-testid={`pro-category-${c}`}>{c.replaceAll("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Catégories secondaires</Label>
                    <Input value={pro.secondary_text || ""} data-testid="pro-secondary-input"
                      placeholder="TOILETTEUR, PET_SITTER"
                      onChange={(e) => setPro({ ...pro, secondary_text: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Zone d'intervention</Label>
                    <Input value={pro.service_area || ""} data-testid="pro-area-input"
                      onChange={(e) => setPro({ ...pro, service_area: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Départements</Label>
                    <Input value={pro.departments_text || ""} data-testid="pro-departments-input" placeholder="45, 77, 89, 91"
                      onChange={(e) => setPro({ ...pro, departments_text: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Site internet</Label>
                    <Input value={pro.website || ""} data-testid="pro-website-input"
                      onChange={(e) => setPro({ ...pro, website: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Téléphone professionnel</Label>
                    <Input value={pro.phone || ""} data-testid="pro-phone-input"
                      onChange={(e) => setPro({ ...pro, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail professionnel</Label>
                    <Input value={pro.email || ""} data-testid="pro-email-input"
                      onChange={(e) => setPro({ ...pro, email: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea rows={3} value={pro.description || ""} data-testid="pro-description-input"
                    onChange={(e) => setPro({ ...pro, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Spécialités</Label>
                  <Input value={pro.specialties_text || ""} data-testid="pro-specialties-input"
                    placeholder="Chiots, marche en laisse, chiens sportifs"
                    onChange={(e) => setPro({ ...pro, specialties_text: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Services proposés</Label>
                  <Input value={pro.services_text || ""} data-testid="pro-services-input"
                    placeholder="Cours individuels, ateliers collectifs"
                    onChange={(e) => setPro({ ...pro, services_text: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Avantage réservé aux adhérents</Label>
                  <Textarea rows={2} value={pro.member_advantages || ""} data-testid="pro-advantages-input"
                    onChange={(e) => setPro({ ...pro, member_advantages: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Visibilité de ma fiche</Label>
                  <Select value={pro.public_visibility || "MEMBERS"}
                    onValueChange={(v) => setPro({ ...pro, public_visibility: v })}>
                    <SelectTrigger data-testid="pro-visibility-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["INTERNAL_ONLY", "BUREAU", "PROFESSIONALS", "MEMBERS", "PUBLIC"].map((v) => (
                        <SelectItem key={v} value={v} data-testid={`pro-visibility-${v}`}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {pro.partnership_status && (
                  <div className="rounded-lg bg-muted/60 p-4 text-sm" data-testid="pro-partnership-readonly">
                    <p className="font-semibold text-[#002060]">Partenariat (géré par le Bureau)</p>
                    <p className="text-xs text-muted-foreground">
                      Statut : {pro.partnership_status} · Contrat : {pro.contract_status || "—"}
                    </p>
                  </div>
                )}
                <Button type="submit" data-testid="pro-save-button" className="rounded-full bg-[#800020] hover:bg-[#63001a]">
                  Enregistrer ma fiche
                </Button>
              </form>
            )}
          </TabsContent>
        )}

        <TabsContent value="dogs" className="mt-6 space-y-4">
          <form onSubmit={addDog} className="space-y-4 rounded-xl border bg-card p-5" data-testid="dog-form">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input required value={newDog.name} data-testid="dog-name-input"
                  onChange={(e) => setNewDog({ ...newDog, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Race</Label>
                <Input value={newDog.breed} data-testid="dog-breed-input"
                  onChange={(e) => setNewDog({ ...newDog, breed: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Caractère</Label>
                <Input value={newDog.character} data-testid="dog-character-input"
                  onChange={(e) => setNewDog({ ...newDog, character: e.target.value })} />
              </div>
            </div>
            <Button type="submit" data-testid="dog-add-button" className="rounded-full bg-[#002060] hover:bg-[#001740]">
              <Plus className="mr-2 h-4 w-4" /> Ajouter mon chien
            </Button>
          </form>
          {dogs.length === 0 ? (
            <EmptyState testId="dogs-empty" title="Aucun chien enregistré"
              description="Renseignez votre chien : ce n'est pas un dossier médical, seulement les informations utiles." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {dogs.map((d) => (
                <div key={d.dog_id} className="flex items-start justify-between rounded-xl border bg-card p-4"
                  data-testid={`dog-card-${d.dog_id}`}>
                  <div>
                    <p className="font-display font-bold text-[#002060]">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.breed || "Race non précisée"}</p>
                    {d.character && <p className="mt-2 text-sm">{d.character}</p>}
                  </div>
                  <button onClick={() => removeDog(d.dog_id)} data-testid={`dog-delete-${d.dog_id}`}
                    aria-label="Supprimer" className="text-muted-foreground transition-colors hover:text-[#800020]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rights" className="mt-6">
          <div className="rounded-xl border bg-card p-5" data-testid="profile-rights">
            <p className="text-sm text-muted-foreground">
              Vos permissions sont contrôlées côté serveur. Rôle : <b>{user?.role}</b>, niveau : <b>{user?.access_level}</b>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(user?.permissions || []).map((p) => (
                <span key={p} className="rounded-full bg-[#002060]/8 px-3 py-1 text-xs font-medium text-[#002060]">{p}</span>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
