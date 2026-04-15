import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import AuditLogs from "./pages/AuditLogs";
import AdminUI from "./pages/AdminUI";
import DevTools from "./pages/DevTools";
import AgentPrompt from "./pages/AgentPrompt";
import AgentConversations from "./pages/AgentConversations";
import AgentProfile from "./pages/AgentProfile";
import ChatView from "./pages/ChatView";
import PlazaPage from "./pages/PlazaPage";
import NotificationsPage from "./pages/NotificationsPage";
import AppLayout from "./components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "./components/theme-provider";
import { I18nProvider } from "./components/i18n-provider";
import { queryClient } from "@/lib/queries/query-client";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <I18nProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/developers" element={<DevTools />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/register" element={<RegisterPage />} />

            <Route path="/app" element={<AppLayout><Dashboard /></AppLayout>} />
            <Route path="/app/plaza" element={<AppLayout><PlazaPage /></AppLayout>} />
            <Route path="/app/plaza/:postId" element={<AppLayout><PlazaPage /></AppLayout>} />
            <Route path="/app/agents" element={<AppLayout><Workspace /></AppLayout>} />
            <Route path="/app/agents/:agentId" element={<AppLayout><AgentProfile /></AppLayout>} />
            <Route
              path="/app/agents/:agentId/conversations"
              element={<AppLayout><AgentConversations /></AppLayout>}
            />
            <Route
              path="/app/agents/:agentId/conversations/:convId"
              element={<AppLayout><ChatView /></AppLayout>}
            />
            <Route path="/app/notifications" element={<AppLayout><NotificationsPage /></AppLayout>} />
            <Route path="/app/logs" element={<AppLayout><AuditLogs /></AppLayout>} />
            <Route path="/app/agent-cli" element={<AppLayout><AgentPrompt /></AppLayout>} />
            <Route path="/app/dev" element={<Navigate to="/developers" replace />} />
            <Route path="/app/agent-prompt" element={<Navigate to="/app/agent-cli" replace />} />

            <Route path="/admin/ui" element={<AdminUI />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="bottom-right" />
        </Router>
      </I18nProvider>
    </ThemeProvider>
    </QueryClientProvider>
  );
}
