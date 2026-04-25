import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home,
  TrendingUp,
  Gift,
  Wallet,
  User,
  Users,
  Bell,
  LogOut,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { useConfig } from '../store/config';
import { cn, formatUsdt } from '../lib/utils';
import AnnouncementBanner from './AnnouncementBanner';

const navItems = [
  { to: '/', label: '首页', icon: Home, feature: null },
  { to: '/trade', label: '合约', icon: TrendingUp, feature: 'trade' },
  { to: '/blindbox', label: '盲盒', icon: Gift, feature: 'blindbox' },
  { to: '/wallet', label: '钱包', icon: Wallet, feature: null },
  { to: '/agent', label: '推广', icon: Users, feature: 'agent' },
];

export default function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const config = useConfig((s) => s.config);
  const isFeatureEnabled = useConfig((s) => s.isFeatureEnabled);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src={config?.site.logo ?? '/logo.svg'} className="h-7 w-7" alt="logo" />
            <span className="hidden md:inline">{config?.site.name ?? '加密期权 & 盲盒平台'}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              if (item.feature && !isFeatureEnabled(item.feature)) return null;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-zinc-800 text-amber-400' : 'text-zinc-300 hover:bg-zinc-800/60'
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link
                  to="/wallet"
                  className="hidden items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs md:flex"
                >
                  <Wallet className="h-3.5 w-3.5 text-amber-400" />
                  <span>{formatUsdt(user.balance)}</span>
                </Link>
                <Link to="/notifications" className="rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-800">
                  <Bell className="h-5 w-5" />
                </Link>
                <Link to="/profile" className="rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-800">
                  <User className="h-5 w-5" />
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-800"
                  title="退出"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost px-3 py-1.5 text-sm">
                  <LogIn className="mr-1 h-4 w-4" /> 登录
                </Link>
                <Link to="/register" className="btn-primary px-3 py-1.5 text-sm">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 pb-24 md:py-6 md:pb-6">
        <AnnouncementBanner />
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden">
        {navItems
          .filter((it) => !it.feature || isFeatureEnabled(it.feature))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px]',
                  isActive ? 'text-amber-400' : 'text-zinc-400'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
