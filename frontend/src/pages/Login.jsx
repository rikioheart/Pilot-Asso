import { useEffect, useState } from "react";
import { Dog, LogIn, Mail, ShieldCheck, Globe } from "lucide-react";
import { Logo } from "@/components/Logo";
import { sanitizeHtml } from "@/components/RichTextEditor";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const ROLES = [
  { value: "PROFESSIONNEL", label: "Professionnel du secteur canin" },
  { value: "PARTICULIER", label: "Particulier / propriétaire de chien" },
];

export default function Login() {
  const { applySession, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [panelText, setPanelText] = useState("");
  const [panelTitle, setPanelTitle] = useState("");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({
    email: "", password: "", first_name: "", last_name: "",
    role: "PARTICULIER", phone: "", city: "", department: "",
  });

  const submitLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", login);
      applySession(data);
      await refresh();
      toast.success(`Bienvenue !`);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", reg);
      applySession(data);
      await refresh();
      toast.success("Demande envoyée. Le Bureau va valider votre adhésion.");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!login.email) return toast.error("Renseignez votre e-mail d'abord.");
    try {
      await api.post("/auth/forgot-password", { email: login.email });
      toast.success("Si ce compte existe, un lien de réinitialisation a été généré.");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const google = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  useEffect(() => {
    api.get("/public/page").then((r) => {
      setWebsiteUrl(r.data?.website_url || "");
      setPanelText(r.data?.login_panel_text || "");
      setPanelTitle(r.data?.login_panel_title || "");
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="vdc-grain relative hidden lg:flex flex-col justify-between p-14 text-white vdc-sidebar">
        <div className="flex items-center gap-4">
          <Logo size={72} withGlow />
          <div>
            <p className="font-display text-lg font-extrabold leading-none">LA VOIX DU CHIEN</p>
            <p className="text-xs text-white/60">Nargis · Loiret · Association</p>
          </div>
        </div>
        <div className="max-w-md vdc-reveal">
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.05]"
            data-testid="login-panel-title">
            {panelTitle || "Le cockpit de notre association."}
          </h1>
          {panelText ? (
            <div className="mt-6 login-panel-rich text-base text-white/75 [&_a]:underline [&_strong]:text-white"
              data-testid="login-panel-text"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(panelText) }} />
          ) : (
            <p className="mt-6 text-base text-white/70" data-testid="login-panel-text">
              Nous savons où nous allons, chacun peut contribuer à son niveau, et chaque petit progrès compte.
            </p>
          )}
          <div className="mt-10 h-px w-24 bg-[var(--bordeaux)]" />
          <p className="mt-6 text-sm text-white/50">
            Action → Preuve → Validation → Historique → Progression
          </p>
        </div>
        <p className="text-xs text-white/40">Plateforme interne · Accès réservé aux membres</p>
      </aside>

      <main className="flex items-center justify-center bg-background px-5 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <Logo size={52} />
            <p className="font-display font-extrabold text-[var(--marine)]">LA VOIX DU CHIEN</p>
          </div>

          <Tabs defaultValue="login">
            <TabsList className="w-full" data-testid="auth-tabs">
              <TabsTrigger value="login" className="flex-1" data-testid="tab-login">Connexion</TabsTrigger>
              <TabsTrigger value="register" className="flex-1" data-testid="tab-register">Créer un compte</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Content de vous revoir</h2>
              <form onSubmit={submitLogin} className="mt-6 space-y-4" data-testid="login-form">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input id="email" type="email" required data-testid="login-email-input"
                    value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe *</Label>
                  <Input id="password" type="password" required data-testid="login-password-input"
                    value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
                </div>
                <Button type="submit" disabled={busy} data-testid="login-submit-button"
                  className="w-full rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)] transition-colors">
                  <LogIn className="mr-2 h-4 w-4" /> {busy ? "Connexion…" : "Se connecter"}
                </Button>
                <button type="button" onClick={forgot} data-testid="forgot-password-link"
                  className="w-full text-center text-sm text-muted-foreground hover:text-[var(--bordeaux)] transition-colors">
                  Mot de passe oublié ?
                </button>
              </form>
              <div className="my-6 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> OU <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" onClick={google} data-testid="google-login-button"
                className="w-full rounded-full border-[var(--marine-a25)]">
                <Mail className="mr-2 h-4 w-4" /> Continuer avec Google
              </Button>
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Rejoindre l'association</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Votre compte sera examiné par le Bureau avant activation.
              </p>
              <form onSubmit={submitRegister} className="mt-6 space-y-4" data-testid="register-form">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Prénom *</Label>
                    <Input required data-testid="register-firstname-input"
                      value={reg.first_name} onChange={(e) => setReg({ ...reg, first_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nom *</Label>
                    <Input required data-testid="register-lastname-input"
                      value={reg.last_name} onChange={(e) => setReg({ ...reg, last_name: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input type="email" required data-testid="register-email-input"
                    value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Mot de passe * (8 caractères minimum)</Label>
                  <Input type="password" required minLength={8} data-testid="register-password-input"
                    value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Je suis *</Label>
                  <div className="grid gap-2">
                    {ROLES.map((r) => (
                      <button key={r.value} type="button" data-testid={`register-role-${r.value.toLowerCase()}`}
                        onClick={() => setReg({ ...reg, role: r.value })}
                        className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                          reg.role === r.value ? "border-[var(--bordeaux)] bg-[var(--bordeaux-a5)] text-[var(--bordeaux)]" : "hover:border-[var(--marine-a40)]"
                        }`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Ville</Label>
                    <Input data-testid="register-city-input" value={reg.city}
                      onChange={(e) => setReg({ ...reg, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Département</Label>
                    <Input data-testid="register-department-input" value={reg.department}
                      onChange={(e) => setReg({ ...reg, department: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" disabled={busy} data-testid="register-submit-button"
                  className="w-full rounded-full bg-[var(--marine)] hover:bg-[#001740] transition-colors">
                  <ShieldCheck className="mr-2 h-4 w-4" /> {busy ? "Envoi…" : "Envoyer ma demande"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {websiteUrl && (
            <div className="mt-8 text-center">
              <a href={websiteUrl} target="_blank" rel="noreferrer" data-testid="discover-association-link"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-[var(--bordeaux)]">
                <Globe className="h-3.5 w-3.5" /> Découvrir l'association
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
