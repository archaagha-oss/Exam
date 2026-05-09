// apps/teacher/src/components/Layout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const nav = [
  { to: '/',             label: 'Dashboard',      icon: '📊', end: true },
  { to: '/questions',    label: 'Question Bank',  icon: '📝', end: false },
  { to: '/questions/ai', label: 'AI Generator',   icon: '✨', end: false },
  { to: '/questions/qti',label: 'QTI Import',     icon: '📥', end: false },
  { to: '/exams/new',    label: 'New Exam',       icon: '➕', end: false },
  { to: '/shared',       label: 'Shared with me', icon: '🤝', end: false },
];

export default function Layout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-base">🔒</div>
            <span className="font-bold text-sm">Secure<span className="text-emerald-400">Exam</span></span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">Teacher Portal</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-emerald-950 text-emerald-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs font-medium text-gray-300 truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          <button
            onClick={() => { clearAuth(); navigate('/login'); }}
            className="mt-3 text-xs text-gray-500 hover:text-gray-300"
          >
            Sign out →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  );
}
