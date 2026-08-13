import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Profile() {
  const { user, profile, setProfile } = useAuth();
  const [form, setForm] = useState({});
  const [dogs, setDogs] = useState([]);
  const [newDog, setNewDog] = useState({ name: "", breed: "", character: "" });

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
    if (user?.status === "ACTIVE") api.get("/dogs").then((r) => setDogs(r.data)).catch(() => {});
  }, [user]);

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
        <TabsList data-testid="profile-tabs">
          <TabsTrigger value="infos" data-testid="profile-tab-infos">Informations</TabsTrigger>
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
