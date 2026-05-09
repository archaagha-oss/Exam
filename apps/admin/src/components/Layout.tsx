// apps/admin/src/components/Layout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const nav = [
  { to: '/',        label: 'Dashboard',    icon: '📊', end: true  },
  { to: '/monitor', label: 'Live monitor', icon: '📡', end: false },
  { to: '/users',   label: 'Users',        icon: '👥', end: false },
  { to: '/classes', label: 'Classes',      icon: '🏫', end: false },
  { to: '/sen',     label: 'SEN / Access', icon: '♿', end: false },
  { to: '/audit',   label: 'Audit log',    icon: '📋', end: false },
  { to: '/settings',label: 'Settings',     icon: '⚙',  end: false },
  { to: '/gdpr',    label: 'GDPR tools',   icon: '🔒', end: false },
];

export default function Layout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-base">🛡</div>
            <span className="font-bold text-sm">Secure<span className="text-amber-400">Exam</span></span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">Admin Portal</p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-amber-950 text-amber-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs font-medium text-gray-300 truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          <p className="text-xs text-amber-600 mt-0.5 font-medium">{user?.role}</p>
          <button
            onClick={() => { clearAuth(); navigate('/login'); }}
            className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
