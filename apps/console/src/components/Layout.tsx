// apps/console/src/components/Layout.tsx
//
// Cycle 2.0b / D6: role-aware sidebar. Teacher items are always shown; the
// Admin section appears only for SCHOOL_ADMIN and PLATFORM_ADMIN. The same
// shell renders for everyone — no separate routes / no app-level redirect
// based on role; the simplest discrimination is the nav itself.
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const teacherNav = [
  { to: '/',             label: 'Dashboard',      icon: '📊', end: true },
  { to: '/questions',    label: 'Question Bank',  icon: '📝', end: false },
  { to: '/questions/ai', label: 'AI Generator',   icon: '✨', end: false },
  { to: '/questions/qti',label: 'QTI Import',     icon: '📥', end: false },
  { to: '/exams/new',    label: 'New Exam',       icon: '➕', end: false },
  { to: '/shared',       label: 'Shared with me', icon: '🤝', end: false },
];

const adminNav = [
  { to: '/admin',          label: 'Overview',       icon: '🏫', end: true },
  { to: '/admin/monitor',  label: 'Live monitor',   icon: '📡', end: false },
  { to: '/admin/users',    label: 'Users',          icon: '👥', end: false },
  { to: '/admin/classes',  label: 'Classes',        icon: '🎓', end: false },
  { to: '/admin/import',   label: 'Bulk import',    icon: '📂', end: false },
  { to: '/admin/sen',      label: 'SEN / access',   icon: '♿', end: false },
  { to: '/admin/audit',    label: 'Audit log',      icon: '📋', end: false },
  { to: '/admin/school',   label: 'School settings',icon: '⚙️', end: false },
  { to: '/admin/gdpr',     label: 'GDPR',           icon: '🔒', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-emerald-950 text-emerald-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
  }`;

export default function Layout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const showAdmin = user?.role === 'SCHOOL_ADMIN' || user?.role === 'PLATFORM_ADMIN';

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-base">🔒</div>
            <span className="font-bold text-sm">Secure<span className="text-emerald-400">Exam</span></span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {showAdmin ? 'School Console' : 'Teacher Console'}
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {teacherNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {showAdmin && (
            <>
              <div className="pt-4 pb-2 px-3 text-xs uppercase tracking-wider text-gray-600">
                Admin
              </div>
              {adminNav.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs font-medium text-gray-300 truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          <p className="text-[10px] text-gray-600 mt-0.5 uppercase tracking-wider">{user?.role}</p>
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
