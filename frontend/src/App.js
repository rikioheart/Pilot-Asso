import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppShell, PendingScreen } from "@/components/AppShell";
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

const Protected = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== "ACTIVE") return <PendingScreen />;
  if (adminOnly && user.role !== "ADMIN_BUREAU") return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
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
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/admin/dashboard" element={<Protected adminOnly><AdminDashboard /></Protected>} />
      <Route path="/admin/members" element={<Protected adminOnly><Members /></Protected>} />
      <Route path="/admin/validation" element={<Protected adminOnly><Validation /></Protected>} />
      <Route path="/admin/help" element={<Protected adminOnly><HelpRequests /></Protected>} />
      <Route path="/admin/import" element={<Protected adminOnly><ImportCsv /></Protected>} />
      <Route path="/admin/audit" element={<Protected adminOnly><Audit /></Protected>} />
      <Route path="/admin/settings" element={<Protected adminOnly><AdminSettings /></Protected>} />
      <Route path="/pro/dashboard" element={<Protected><ProDashboard /></Protected>} />
      <Route path="/member/dashboard" element={<Protected><MemberDashboard /></Protected>} />
      <Route path="/projects" element={<Protected><Projects /></Protected>} />
      <Route path="/projects/:projectId" element={<Protected><ProjectDetail /></Protected>} />
      <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
      <Route path="/directory" element={<Protected><Directory /></Protected>} />
      <Route path="/help" element={<Protected><HelpRequests /></Protected>} />
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
        <AppRouter />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
