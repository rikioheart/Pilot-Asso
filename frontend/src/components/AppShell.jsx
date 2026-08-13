import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Bell, Dog, FileText, History, Home, LogOut, Menu, Network, Settings, ShieldCheck,
  Sparkles, Users, X, CalendarDays, FolderKanban, HeartHandshake, UserCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Button } from "@/components/ui/button";

const SOON = " (phase suivante)";

const BUREAU_NAV = [
  { to: "/admin/dashboard", label: "Accueil", icon: Home },
  { to: "/admin/members", label: "Membres", icon: Users },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/audit", label: "Journal d'audit", icon: History },
  { to: "/admin/settings", label: "Administration", icon: Settings },
  { to: "/profile", label: "Mon profil", icon: UserCircle },
];

const PRO_NAV = [
  { to: "/pro/dashboard", label: "Accueil", icon: Home },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Mon profil", icon: UserCircle },
];

const MEMBER_NAV = [
  { to: "/member/dashboard", label: "Accueil", icon: Home },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Mon profil", icon: UserCircle },
];

const PLANNED = [
  { label: "Mindmap", icon: Network },
  { label: "Projets", icon: FolderKanban },
  { label: "Calendrier", icon: CalendarDays },
  { label: "Partenaires", icon: HeartHandshake },
  { label: "Documents", icon: FileText },
];

export const AppShell = ({ children }) => {
  const { user, profile, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const nav = user?.role === "ADMIN_BUREAU" ? BUREAU_NAV : user?.role === "PROFESSIONNEL" ? PRO_NAV : MEMBER_NAV;
  const roleLabel = { ADMIN_BUREAU: "Bureau", PROFESSIONNEL: "Professionnel", PARTICULIER: "Adhérent" }[user?.role];

  const sidebar = (
    <div className="vdc-sidebar vdc-grain relative flex h-full w-64 shrink-0 flex-col text-white">
      <Link to="/" className="flex items-center gap-3 px-5 py-6" data-testid="sidebar-logo">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#800020]">
          <Dog className="h-5 w-5" />
        </span>
        <span>
          <span className="block font-display text-sm font-extrabold leading-tight">LA VOIX DU CHIEN</span>
          <span className="block text-[11px] text-white/50">Cockpit interne</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive ? "bg-[#800020] font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}>
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
        <p className="px-3 pt-6 pb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">À venir</p>
        {PLANNED.map(({ label, icon: Icon }) => (
          <span key={label} title={label + SOON}
            className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/30">
            <Icon className="h-4 w-4" /> {label}
          </span>
        ))}
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
      <div className="hidden lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" data-testid="mobile-sidebar">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative">{sidebar}</div>
          <button onClick={() => setOpen(false)} data-testid="mobile-sidebar-close"
            className="absolute right-4 top-4 text-white"><X className="h-6 w-6" /></button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button"
            aria-label="Ouvrir le menu">
            <Menu className="h-6 w-6 text-[#002060]" />
          </button>
          <div className="flex-1"><GlobalSearch /></div>
          <NotificationBell />
          <Link to="/profile" data-testid="header-profile-link"
            className="grid h-10 w-10 place-items-center rounded-full bg-[#002060] text-sm font-bold text-white">
            {(profile?.display_name || user?.email || "?").slice(0, 1).toUpperCase()}
          </Link>
        </header>
        <main key={location.pathname} className="vdc-reveal min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};

export const PendingScreen = () => {
  const { user, profile, logout } = useAuth();
  return (
    <div className="min-h-screen grid place-items-center bg-background px-5" data-testid="pending-approval-screen">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#800020]/10">
          <ShieldCheck className="h-7 w-7 text-[#800020]" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-extrabold text-[#002060]">Demande en cours d'examen</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Merci {profile?.first_name || user?.email} ! Votre adhésion a été transmise au Bureau.
          Vous recevrez une notification dès sa validation.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-[#002060]">
          <Sparkles className="h-3.5 w-3.5" /> Statut : {user?.status}
        </p>
        <Button variant="outline" onClick={logout} data-testid="pending-logout-button" className="mt-8 w-full rounded-full">
          Se déconnecter
        </Button>
      </div>
    </div>
  );
};
