import { useMemo, useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Bell, ChevronDown, History, Home, LogOut, Menu, Network, Settings, ShieldCheck, Sparkles, Users, X,
  CalendarDays, FolderKanban, HeartHandshake, UserCircle, ListChecks, CheckCircle2, LifeBuoy,
  Dog, Wallet as WalletIcon,
  BookUser, Upload, FileText, Sparkle, PartyPopper, QrCode, Star, BarChart3, TicketCheck,
  Newspaper, GraduationCap, Library, Send, Trophy, Gift, Wallet, Boxes, MapPinned, ClipboardList,
  Receipt, Handshake, BookOpen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ICON_LIBRARY } from "@/lib/moduleIcons";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { HelpButton } from "@/components/HelpButton";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { FocusToggle, FocusPomodoro } from "@/components/FocusMode";
import { useNavLabels } from "@/lib/useNavLabels";
import { OfflineIndicator } from "@/components/OfflineMode";
import { useBlockVisibleFn } from "@/components/BlockVisibility";
import { LogoLockup, Logo } from "@/components/Logo";
import { Onboarding } from "@/components/Onboarding";
import { ActivationJourney } from "@/components/ActivationJourney";
import { Button } from "@/components/ui/button";

const BUREAU_NAV = [
  { label: "Accueil", to: "/admin/dashboard", icon: Home },
  { label: "Activités", to: "/activities", icon: Sparkle },
  { label: "Tâches", to: "/tasks", icon: ListChecks },
  { label: "Validation", to: "/admin/validation", icon: CheckCircle2 },
  { label: "Membres", to: "/admin/members", icon: Users },
  { label: "Finances", to: "/finance", icon: Wallet },
  {
    label: "Pilotage", icon: FolderKanban, items: [
      { to: "/pilotage", label: "Pilotage suivi", icon: BarChart3 },
      { to: "/projects", label: "Projets", icon: FolderKanban },
      { to: "/mindmap", label: "Mindmap", icon: Network },
      { to: "/admin/help", label: "Besoins d'aide", icon: LifeBuoy },
      { to: "/aide", label: "Espace aide", icon: BookOpen },
    ],
  },
  {
    label: "Vie de l'asso", icon: CalendarDays, items: [
      { to: "/calendar", label: "Calendrier", icon: CalendarDays },
      { to: "/agenda", label: "Agenda partagé", icon: CalendarDays },
      { to: "/events", label: "Événements", icon: PartyPopper },
      { to: "/terrains", label: "Terrains", icon: MapPinned },
      { to: "/admin/engagement", label: "Engagement", icon: Star },
      { to: "/advantages", block: "nav.advantages", label: "Avantages", icon: Gift },
    ],
  },
  {
    label: "Communication", icon: Newspaper, items: [
      { to: "/blog", block: "nav.blog", label: "Blog & contenus", icon: Newspaper },
      { to: "/formations", block: "nav.formations", label: "Formations & lives", icon: GraduationCap },
      { to: "/library", block: "nav.library", label: "Bibliothèque", icon: Library },
      { to: "/social", block: "nav.social", label: "Réseaux sociaux", icon: Send },
      { to: "/contests", block: "nav.contests", label: "Jeux-concours", icon: Trophy },
      { to: "/advent", block: "nav.advent", label: "Calendrier de l'Avent", icon: Gift },
    ],
  },
  {
    label: "Gestion", icon: Wallet, items: [
      { to: "/finance/reimbursements", label: "Remboursements", icon: Receipt },
      { to: "/paiements", label: "Paiements", icon: Wallet },
      { to: "/stock", label: "Stocks", icon: Boxes },
      { to: "/partners", label: "Partenaires", icon: Handshake },
      { to: "/documents", label: "Documents", icon: FileText },
      { to: "/forms", block: "nav.forms", label: "Formulaires", icon: ClipboardList },
    ],
  },
  {
    label: "Administration", icon: Settings, items: [
      { to: "/dogs", label: "Chiens suivis", icon: Dog },
      { to: "/admin/animation", label: "Animation des membres", icon: HeartHandshake },
      { to: "/my-space", label: "Mon espace & préférences", icon: UserCircle },
      { to: "/directory", label: "Annuaire pro", icon: BookUser },
      { to: "/statistics", label: "Statistiques", icon: BarChart3 },
      { to: "/admin/import", label: "Import CSV", icon: Upload },
      { to: "/admin/audit", label: "Journal d'audit", icon: History },
      { to: "/admin/settings", label: "Réglages", icon: Settings },
    ],
  },
];

const PRO_NAV = [
  { label: "Accueil", to: "/pro/dashboard", icon: Home },
  { label: "Mes tâches", to: "/tasks", icon: ListChecks },
  { label: "Activités", to: "/activities", icon: Sparkle, permission: "activities.view" },
  { label: "Participations", to: "/participations", icon: TicketCheck },
  {
    label: "Mon activité", icon: FolderKanban, items: [
      { to: "/projects", label: "Projets", icon: FolderKanban, permission: "projects.view" },
      { to: "/pilotage", label: "Pilotage suivi", icon: BarChart3, permission: "stats.view" },
      { to: "/mindmap", label: "Mindmap", icon: Network, permission: "mindmap.view" },
      { to: "/statistics", label: "Statistiques", icon: BarChart3, permission: "stats.view" },
      { to: "/dogs", label: "Chiens suivis", icon: Dog },
      { to: "/finance/my-shares", label: "Mes parts & frais", icon: Wallet, permission: "finance.view_own" },
      { to: "/history", label: "Mon historique", icon: History, permission: "audit.view_own" },
      { to: "/paiements", label: "Mes paiements", icon: Wallet },
      { to: "/my-space", label: "Mon espace & préférences", icon: Settings },
    ],
  },
  {
    label: "Vie de l'asso", icon: CalendarDays, items: [
      { to: "/calendar", label: "Calendrier", icon: CalendarDays },
      { to: "/agenda", label: "Agenda partagé", icon: CalendarDays },
      { to: "/events", label: "Événements", icon: PartyPopper, permission: "events.view" },
      { to: "/terrains", label: "Terrains", icon: MapPinned, permission: "terrain.view" },
      { to: "/loyalty/scan", label: "Valider une participation", icon: QrCode, permission: "loyalty.stamp" },
    ],
  },
  {
    label: "Contenus", icon: Newspaper, items: [
      { to: "/blog", block: "nav.blog", label: "Blog & contenus", icon: Newspaper, permission: "content.view" },
      { to: "/formations", block: "nav.formations", label: "Formations & lives", icon: GraduationCap, permission: "formations.view" },
      { to: "/library", block: "nav.library", label: "Bibliothèque", icon: Library, permission: "library.view" },
      { to: "/social", block: "nav.social", label: "Réseaux sociaux", icon: Send, permission: "social.view" },
      { to: "/documents", label: "Documents", icon: FileText, permission: "documents.view" },
      { to: "/forms", block: "nav.forms", label: "Formulaires", icon: ClipboardList, permission: "forms.view" },
    ],
  },
  {
    label: "Réseau", icon: HeartHandshake, items: [
      { to: "/directory", label: "Annuaire", icon: BookUser, permission: "members.view" },
      { to: "/partners", label: "Partenaires", icon: Handshake, permission: "partners.view" },
      { to: "/advantages", block: "nav.advantages", label: "Avantages adhérents", icon: Gift, permission: "advantages.view" },
      { to: "/help", label: "Aide", icon: LifeBuoy },
      { to: "/aide", label: "Espace aide", icon: BookOpen },
      { to: "/profile", label: "Mon profil", icon: UserCircle },
    ],
  },
];

const MEMBER_NAV = [
  { label: "Accueil", to: "/member/dashboard", icon: Home },
  { label: "Activités", to: "/activities", icon: Sparkle, permission: "activities.view" },
  { label: "Mon chien", to: "/dogs", icon: Dog },
  { label: "Ma fidélité", to: "/loyalty", icon: Star, block: "nav.loyalty", permission: "loyalty.view_own" },
  {
    label: "Participer", icon: CalendarDays, items: [
      { to: "/calendar", label: "Calendrier", icon: CalendarDays },
      { to: "/events", label: "Événements", icon: PartyPopper, permission: "events.view" },
      { to: "/participations", label: "Mes participations", icon: TicketCheck },
      { to: "/terrains", label: "Terrains", icon: MapPinned, permission: "terrain.view" },
    ],
  },
  {
    label: "Mes avantages", icon: Gift, items: [
      { to: "/advantages", block: "nav.advantages", label: "Avantages adhérents", icon: Gift, permission: "advantages.view" },
      { to: "/contests", block: "nav.contests", label: "Jeux-concours", icon: Trophy, permission: "contests.view" },
      { to: "/advent", block: "nav.advent", label: "Calendrier de l'Avent", icon: Gift, permission: "advent.view" },
    ],
  },
  {
    label: "Contenus", icon: Newspaper, items: [
      { to: "/blog", block: "nav.blog", label: "Blog & conseils", icon: Newspaper, permission: "content.view" },
      { to: "/formations", block: "nav.formations", label: "Formations & lives", icon: GraduationCap, permission: "formations.view" },
      { to: "/library", block: "nav.library", label: "Bibliothèque", icon: Library, permission: "library.view" },
      { to: "/forms", block: "nav.forms", label: "Formulaires", icon: ClipboardList, permission: "forms.view" },
    ],
  },
  {
    label: "Mon espace", icon: UserCircle, items: [
      { to: "/profile", label: "Mon profil & mes chiens", icon: UserCircle },
      { to: "/my-space", label: "Mon espace & préférences", icon: Settings },
      { to: "/paiements", label: "Mes paiements", icon: Wallet },
      { to: "/tasks", label: "Mes missions", icon: ListChecks, permission: "tasks.view" },
      { to: "/projects", label: "Projets", icon: FolderKanban, permission: "projects.view" },
      { to: "/directory", label: "Professionnels", icon: BookUser, permission: "members.view" },
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/help", label: "Aide", icon: LifeBuoy },
      { to: "/aide", label: "Espace aide", icon: BookOpen },
    ],
  },
];

const slug = (label) => label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const AppShell = ({ children }) => {
  const { user, profile, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const blockVisible = useBlockVisibleFn();
  const [moduleIcons, setModuleIcons] = useState({});
  useEffect(() => {
    api.get("/settings/module-icons").then((r) => setModuleIcons(r.data.icons || {})).catch(() => {});
  }, []);
  const iconFor = (to, fallback) => ICON_LIBRARY[moduleIcons[to]] || fallback;

  const base = user?.role === "ADMIN_BUREAU" ? BUREAU_NAV : user?.role === "PROFESSIONNEL" ? PRO_NAV : MEMBER_NAV;
  const navLabels = useNavLabels();
  const nav = useMemo(() => base
    .filter((group) => group.items || ((!group.permission || can(group.permission)) && blockVisible(group.block)))
    .map((group) => {
      const glabel = navLabels[group.label] || group.label;
      return group.items
        ? { ...group, label: glabel, items: group.items
            .filter((item) => (!item.permission || can(item.permission)) && blockVisible(item.block))
            .map((item) => ({ ...item, label: navLabels[item.label] || item.label })) }
        : { ...group, label: glabel };
    })
    .filter((group) => !group.items || group.items.length > 0), [base, can, blockVisible, navLabels]);

  const activeGroup = nav.find((group) => group.items?.some((item) => location.pathname.startsWith(item.to)));
  const [expanded, setExpanded] = useState(activeGroup?.label || nav.find((g) => g.items)?.label);
  const roleLabel = { ADMIN_BUREAU: "Bureau", PROFESSIONNEL: "Professionnel", PARTICULIER: "Adhérent" }[user?.role];
  const mobileItems = useMemo(() => {
    const directs = nav.filter((g) => !g.items);
    const rest = nav.filter((g) => g.items).flatMap((g) => g.items);
    return [...directs, ...rest].slice(0, 4);
  }, [nav]);

  const sidebar = (
    <div className="vdc-sidebar vdc-grain relative flex h-full w-64 shrink-0 flex-col text-white">
      <Link to="/" className="px-5 py-6" data-testid="sidebar-logo" onClick={() => setOpen(false)}>
        <LogoLockup size={46} />
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
        {nav.map((group) => {
          if (!group.items) {
            const Icon = iconFor(group.to, group.icon);
            return (
              <NavLink key={group.to} to={group.to} onClick={() => setOpen(false)}
                data-testid={`nav-${slug(group.label)}`}
                className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-[var(--bordeaux)] font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{group.label}</span>
              </NavLink>
            );
          }
          const Icon = group.icon;
          const isOpen = expanded === group.label;
          const hasActive = group.items.some((item) => location.pathname.startsWith(item.to));
          return (
            <div key={group.label}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : group.label)}
                data-testid={`nav-group-${slug(group.label)}`}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  hasActive ? "text-white" : "text-white/70"} hover:bg-white/10 hover:text-white`}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left font-semibold">{group.label}</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="mt-1 space-y-0.5 border-l border-white/12 pl-3 ml-4">
                  {group.items.map(({ to, label, icon: ItemIcon }) => {
                    const RIcon = iconFor(to, ItemIcon);
                    return (
                    <NavLink key={to} to={to} onClick={() => setOpen(false)} data-testid={`nav-${slug(label)}`}
                      className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                        isActive ? "bg-[var(--bordeaux)] font-semibold text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                      <RIcon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{label}</span>
                    </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-4 py-4">
        <p className="text-sm font-semibold">{profile?.display_name || user?.email}</p>
        <p className="text-xs text-white/50">{roleLabel} · {user?.access_level}</p>
        <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-button"
          className="mt-2 w-full justify-start px-0 text-white/70 hover:bg-transparent hover:text-white">
          <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" data-testid="mobile-sidebar">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative">{sidebar}</div>
          <button onClick={() => setOpen(false)} data-testid="mobile-sidebar-close"
            className="absolute right-4 top-4 text-white"><X className="h-6 w-6" /></button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-card/90 px-4 py-3 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button"
            aria-label="Ouvrir le menu">
            <Menu className="h-6 w-6 text-[var(--marine)]" />
          </button>
          <Link to="/" className="lg:hidden" data-testid="header-logo"><Logo size={32} /></Link>
          <div className="flex-1"><GlobalSearch /></div>
          <OfflineIndicator />
          <FocusToggle />
          <div className="hidden sm:block"><HelpButton /></div>
          <div className="sm:hidden"><HelpButton compact /></div>
          <NotificationBell />
          <Link to="/profile" data-testid="header-profile-link"
            className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--marine)] text-sm font-bold text-white">
            {profile?.avatar
              ? <img src={profile.avatar} alt="Mon profil" className="h-full w-full object-cover" />
              : (profile?.display_name || user?.email || "?").slice(0, 1).toUpperCase()}
          </Link>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <Onboarding />
        <ActivationJourney />
        <QuickActionsFab />
        <FocusPomodoro />
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t bg-card lg:hidden"
          data-testid="mobile-bottom-nav" aria-label="Navigation principale">
          {mobileItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} data-testid={`bottom-nav-${slug(label)}`}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-semibold ${
                isActive ? "text-[var(--bordeaux)]" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" /> <span className="truncate">{label}</span>
            </NavLink>
          ))}
          <button type="button" onClick={() => setOpen(true)} data-testid="bottom-nav-menu"
            className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-semibold text-muted-foreground">
            <Menu className="h-5 w-5" /> Menu
          </button>
        </nav>
      </div>
    </div>
  );
};

export const PendingScreen = () => {
  const { user, profile, logout } = useAuth();
  return (
    <div className="min-h-screen grid place-items-center bg-background px-5" data-testid="pending-approval-screen">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bordeaux-a10)]">
          <ShieldCheck className="h-7 w-7 text-[var(--bordeaux)]" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-extrabold text-[var(--marine)]">Demande en cours d'examen</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Merci {profile?.first_name || user?.email} ! Votre adhésion a été transmise au Bureau.
          Vous recevrez une notification dès sa validation.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-[var(--marine)]">
          <Sparkles className="h-3.5 w-3.5" /> Statut : {user?.status}
        </p>
        <Button variant="outline" onClick={logout} data-testid="pending-logout-button" className="mt-8 w-full rounded-full">
          Se déconnecter
        </Button>
      </div>
    </div>
  );
};
