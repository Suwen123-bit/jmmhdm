import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Trade from './pages/Trade';
import Blindbox from './pages/Blindbox';
import BlindboxDetail from './pages/BlindboxDetail';
import Wallet from './pages/Wallet';
import Deposit from './pages/Deposit';
import Withdraw from './pages/Withdraw';
import Profile from './pages/Profile';
import Agent from './pages/Agent';
import Notifications from './pages/Notifications';
import Inventory from './pages/Inventory';
import Tickets from './pages/Tickets';
import Kyc from './pages/Kyc';
import AiAssistant from './pages/AiAssistant';
import AgreementView from './pages/AgreementView';
import { useAuth } from './store/auth';
import { useConfig } from './store/config';
import { ws } from './lib/ws';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  if (loading) return <div className="p-10 text-center text-zinc-400">加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const fetchMe = useAuth((s) => s.fetchMe);
  const fetchConfig = useConfig((s) => s.fetchConfig);

  useEffect(() => {
    void fetchConfig();
    void fetchMe();
    ws.connect();
    return () => ws.disconnect();
  }, [fetchConfig, fetchMe]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/agreement/view" element={<AgreementView />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="trade" element={<Trade />} />
            <Route path="trade/:symbol" element={<Trade />} />
            <Route path="blindbox" element={<Blindbox />} />
            <Route path="blindbox/:id" element={<BlindboxDetail />} />
            <Route
              path="wallet"
              element={
                <RequireAuth>
                  <Wallet />
                </RequireAuth>
              }
            />
            <Route
              path="wallet/deposit"
              element={
                <RequireAuth>
                  <Deposit />
                </RequireAuth>
              }
            />
            <Route
              path="wallet/withdraw"
              element={
                <RequireAuth>
                  <Withdraw />
                </RequireAuth>
              }
            />
            <Route
              path="profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="agent"
              element={
                <RequireAuth>
                  <Agent />
                </RequireAuth>
              }
            />
            <Route
              path="notifications"
              element={
                <RequireAuth>
                  <Notifications />
                </RequireAuth>
              }
            />
            <Route
              path="inventory"
              element={
                <RequireAuth>
                  <Inventory />
                </RequireAuth>
              }
            />
            <Route
              path="tickets"
              element={
                <RequireAuth>
                  <Tickets />
                </RequireAuth>
              }
            />
            <Route
              path="kyc"
              element={
                <RequireAuth>
                  <Kyc />
                </RequireAuth>
              }
            />
            <Route
              path="ai"
              element={
                <RequireAuth>
                  <AiAssistant />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" toastOptions={{ style: { background: '#14171f', color: '#f4f4f5', border: '1px solid #27272a' } }} />
    </QueryClientProvider>
  );
}
