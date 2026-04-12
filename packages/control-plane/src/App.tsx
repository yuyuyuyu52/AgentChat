import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import AuditLogs from "./pages/AuditLogs";
import AdminUI from "./pages/AdminUI";
import DevTools from "./pages/DevTools";
import AgentConversations from "./pages/AgentConversations";
import ChatView from "./pages/ChatView";
import AppLayout from "./components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/app" element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/app/agents" element={<AppLayout><Workspace /></AppLayout>} />
        <Route
          path="/app/agents/:agentId/conversations"
          element={<AppLayout><AgentConversations /></AppLayout>}
        />
        <Route
          path="/app/agents/:agentId/conversations/:convId"
          element={<AppLayout><ChatView /></AppLayout>}
        />
        <Route path="/app/logs" element={<AppLayout><AuditLogs /></AppLayout>} />
        <Route path="/app/dev" element={<AppLayout><DevTools /></AppLayout>} />

        <Route path="/admin/ui" element={<AdminUI />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster theme="dark" position="bottom-right" />
    </Router>
  );
}
