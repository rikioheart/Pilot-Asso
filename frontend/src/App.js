import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConfirmDialogHost } from "@/components/ConfirmDialog";
import { EmptyStatesProvider } from "@/components/EmptyStates";
import { BlockVisibilityProvider } from "@/components/BlockVisibility";
import { OfflineProvider } from "@/components/OfflineMode";
import { AppShell, PendingScreen } from "@/components/AppShell";
import Public from "@/pages/Public";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import AdminDashboard from "@/pages/AdminDashboard";
import ProDashboard from "@/pages/ProDashboard";
import MemberDashboard from "@/pages/MemberDashboard";
import Members from "@/pages/Members";
import Notifications from "@/pages/Notifications";
import Profile from "@/pages/Profile";
import Audit from "@/pages/Audit";
import AdminSettings from "@/pages/AdminSettings";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Tasks from "@/pages/Tasks";
import Validation from "@/pages/Validation";
import Directory from "@/pages/Directory";
import ImportCsv from "@/pages/ImportCsv";
import HelpRequests from "@/pages/HelpRequests";
import HelpCenter from "@/pages/HelpCenter";
import Calendar from "@/pages/Calendar";
import SharedCalendar from "@/pages/SharedCalendar";
import Activities from "@/pages/Activities";
import Events from "@/pages/Events";
import EventDetail from "@/pages/EventDetail";
import Participations from "@/pages/Participations";
import LoyaltyCard from "@/pages/LoyaltyCard";
import LoyaltyScan from "@/pages/LoyaltyScan";
import LoyaltyRules from "@/pages/LoyaltyRules";
import Engagement from "@/pages/Engagement";
import Statistics from "@/pages/Statistics";
import Mindmap from "@/pages/Mindmap";
import Blog from "@/pages/Blog";
import Formations from "@/pages/Formations";
import LibraryPage from "@/pages/LibraryPage";
import SocialPlanner from "@/pages/SocialPlanner";
import Contests from "@/pages/Contests";
import Advent from "@/pages/Advent";
import Advantages from "@/pages/Advantages";
import Finance from "@/pages/Finance";
import Reimbursements from "@/pages/Reimbursements";
import MyShares from "@/pages/MyShares";
import Partners from "@/pages/Partners";
import Terrains from "@/pages/Terrains";
import Stock from "@/pages/Stock";
import Documents from "@/pages/Documents";
import Forms from "@/pages/Forms";
import MyHistory from "@/pages/MyHistory";
import MySpace from "@/pages/MySpace";
import MemberAnimation from "@/pages/MemberAnimation";
import Payments from "@/pages/Payments";
import Dogs from "@/pages/Dogs";
import Pilotage from "@/pages/Pilotage";
import PublicProCard from "@/pages/PublicProCard";
import "@/App.css";

const HOME_BY_ROLE = {
  ADMIN_BUREAU: "/admin/dashboard",
  PROFESSIONNEL: "/pro/dashboard",
  PARTICULIER: "/member/dashboard",
};

const Loading = () => (
  <div className="min-h-screen grid place-items-center bg-background text-muted-foreground" data-testid="app-loading">
    Chargement…
  </div>
);

const Protected = ({ children, adminOnly = false, permission = null }) => {
  const { user, loading, can } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== "ACTIVE") return <PendingScreen />;
  if (adminOnly && user.role !== "ADMIN_BUREAU") return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  if (permission && !can(permission)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <AppShell>{children}</AppShell>;
};

const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== "ACTIVE") return <PendingScreen />;
  return <Navigate to={HOME_BY_ROLE[user.role] || "/member/dashboard"} replace />;
};

const LoginRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
};

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/carte/:userId" element={<PublicProCard />} />
      <Route path="/public" element={<Public />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/admin/dashboard" element={<Protected adminOnly><AdminDashboard /></Protected>} />
      <Route path="/admin/members" element={<Protected adminOnly><Members /></Protected>} />
      <Route path="/admin/validation" element={<Protected adminOnly><Validation /></Protected>} />
      <Route path="/admin/help" element={<Protected adminOnly><HelpRequests /></Protected>} />
      <Route path="/admin/import" element={<Protected adminOnly><ImportCsv /></Protected>} />
      <Route path="/admin/loyalty" element={<Protected adminOnly><LoyaltyRules /></Protected>} />
      <Route path="/admin/engagement" element={<Protected adminOnly><Engagement /></Protected>} />
      <Route path="/admin/audit" element={<Protected adminOnly><Audit /></Protected>} />
      <Route path="/admin/settings" element={<Protected adminOnly><AdminSettings /></Protected>} />
      <Route path="/pro/dashboard" element={<Protected><ProDashboard /></Protected>} />
      <Route path="/member/dashboard" element={<Protected><MemberDashboard /></Protected>} />
      <Route path="/projects" element={<Protected permission="projects.view"><Projects /></Protected>} />
      <Route path="/projects/:projectId" element={<Protected permission="projects.view"><ProjectDetail /></Protected>} />
      <Route path="/tasks" element={<Protected permission="tasks.view"><Tasks /></Protected>} />
      <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
      <Route path="/agenda" element={<Protected><SharedCalendar /></Protected>} />
      <Route path="/activities" element={<Protected permission="activities.view"><Activities /></Protected>} />
      <Route path="/events" element={<Protected permission="events.view"><Events /></Protected>} />
      <Route path="/events/:eventId" element={<Protected permission="events.view"><EventDetail /></Protected>} />
      <Route path="/participations" element={<Protected><Participations /></Protected>} />
      <Route path="/loyalty" element={<Protected permission="loyalty.view_own"><LoyaltyCard /></Protected>} />
      <Route path="/loyalty/scan" element={<Protected permission="loyalty.stamp"><LoyaltyScan /></Protected>} />
      <Route path="/statistics" element={<Protected permission="stats.view"><Statistics /></Protected>} />
      <Route path="/mindmap" element={<Protected permission="mindmap.view"><Mindmap /></Protected>} />
      <Route path="/directory" element={<Protected permission="members.view"><Directory /></Protected>} />
      <Route path="/blog" element={<Protected permission="content.view"><Blog /></Protected>} />
      <Route path="/formations" element={<Protected permission="formations.view"><Formations /></Protected>} />
      <Route path="/library" element={<Protected permission="library.view"><LibraryPage /></Protected>} />
      <Route path="/social" element={<Protected permission="social.view"><SocialPlanner /></Protected>} />
      <Route path="/contests" element={<Protected permission="contests.view"><Contests /></Protected>} />
      <Route path="/advent" element={<Protected permission="advent.view"><Advent /></Protected>} />
      <Route path="/advantages" element={<Protected permission="advantages.view"><Advantages /></Protected>} />
      <Route path="/finance" element={<Protected adminOnly><Finance /></Protected>} />
      <Route path="/finance/reimbursements" element={<Protected adminOnly><Reimbursements /></Protected>} />
      <Route path="/finance/my-shares" element={<Protected permission="finance.view_own"><MyShares /></Protected>} />
      <Route path="/partners" element={<Protected permission="partners.view"><Partners /></Protected>} />
      <Route path="/terrains" element={<Protected permission="terrain.view"><Terrains /></Protected>} />
      <Route path="/stock" element={<Protected permission="stock.view"><Stock /></Protected>} />
      <Route path="/documents" element={<Protected permission="documents.view"><Documents /></Protected>} />
      <Route path="/forms" element={<Protected permission="forms.view"><Forms /></Protected>} />
      <Route path="/history" element={<Protected permission="audit.view_own"><MyHistory /></Protected>} />
      <Route path="/my-space" element={<Protected><MySpace /></Protected>} />
      <Route path="/paiements" element={<Protected><Payments /></Protected>} />
      <Route path="/dogs" element={<Protected><Dogs /></Protected>} />
      <Route path="/pilotage" element={<Protected permission="stats.view"><Pilotage /></Protected>} />
      <Route path="/admin/animation" element={<Protected adminOnly><MemberAnimation /></Protected>} />
      <Route path="/help" element={<Protected><HelpRequests /></Protected>} />
      <Route path="/aide" element={<Protected><HelpCenter /></Protected>} />
      <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
        <EmptyStatesProvider>
        <BlockVisibilityProvider>
        <OfflineProvider>
        <AccessibilityProvider>
          <AppRouter />
        </AccessibilityProvider>
        </OfflineProvider>
        </BlockVisibilityProvider>
        </EmptyStatesProvider>
        <ConfirmDialogHost />
        </ThemeProvider>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
