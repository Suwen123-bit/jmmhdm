import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './pages/Login';
import Layout from './pages/Layout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Trades from './pages/Trades';
import Deposits from './pages/Deposits';
import Withdrawals from './pages/Withdrawals';
import Blindboxes from './pages/Blindboxes';
import Products from './pages/Products';
import Agents from './pages/Agents';
import Tickets from './pages/Tickets';
import Configs from './pages/Configs';
import Risks from './pages/Risks';
import AuditLogs from './pages/AuditLogs';
import Announcements from './pages/Announcements';
import Agreements from './pages/Agreements';
import KycReview from './pages/KycReview';
import AiMonitor from './pages/AiMonitor';
import Reports from './pages/Reports';
import { useAuth } from './store/auth';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const fetchMe = useAuth((s) => s.fetchMe);
  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="trades" element={<Trades />} />
            <Route path="deposits" element={<Deposits />} />
            <Route path="withdrawals" element={<Withdrawals />} />
            <Route path="blindboxes" element={<Blindboxes />} />
            <Route path="products" element={<Products />} />
            <Route path="agents" element={<Agents />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="configs" element={<Configs />} />
            <Route path="risks" element={<Risks />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="agreements" element={<Agreements />} />
            <Route path="kyc" element={<KycReview />} />
            <Route path="ai-monitor" element={<AiMonitor />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
