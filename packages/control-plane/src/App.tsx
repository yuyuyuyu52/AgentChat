import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
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
    <Router basename="/admin/ui">
      <Routes>
        <Route path="/" element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/agents" element={<AppLayout><Workspace /></AppLayout>} />
        <Route
          path="/agents/:agentId/conversations"
          element={<AppLayout><AgentConversations /></AppLayout>}
        />
        <Route
          path="/agents/:agentId/conversations/:convId"
          element={<AppLayout><ChatView /></AppLayout>}
        />
        <Route path="/logs" element={<AppLayout><AuditLogs /></AppLayout>} />
        <Route path="/dev" element={<AppLayout><DevTools /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><AdminUI /></AppLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster theme="dark" position="bottom-right" />
    </Router>
  );
}
