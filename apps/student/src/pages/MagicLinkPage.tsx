// apps/student/src/pages/MagicLinkPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// This page handles /join/:token
// It validates the magic link, auto-authenticates the student, and redirects to their exam.

export default function MagicLinkPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [status, setStatus] = useState<'checking' | 'blocked' | 'expired' | 'used' | 'error'>(
    'checking'
  );
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    // Call the security endpoint to validate the token
    fetch(
      `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'}/security/join/${token}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 410) {
            if (data.error?.includes('already been used')) setStatus('used');
            else setStatus('expired');
          } else if (res.status === 403 && data.code === 'IP_BLOCKED') {
            setStatus('blocked');
            setDetail(data.detail ?? '');
          } else {
            setStatus('error');
            setDetail(data.error ?? 'Unknown error');
          }
          return;
        }

        const { examId, student } = data.data;

        // Auto-login the student using their credentials from the invite
        // We do this by generating a short-lived session token server-side
        // For now: store student identity and redirect to exam
        // In production: exchange the preAuthToken for a real JWT
        setAuth(data.data.preAuthToken, {
          id: student.id,
          name: student.name,
          email: student.email,
          role: 'STUDENT',
          schoolId: null,
        });

        // Start session for this exam
        navigate(`/?autoStart=${examId}`, { replace: true });
      })
      .catch(() => {
        setStatus('error');
      });
  }, [token]);

  const states = {
    checking: {
      icon: '🔐',
      title: 'Verifying your access link…',
      text: 'Please wait while we validate your link.',
      color: 'text-gray-400',
    },
    blocked: {
      icon: '🚫',
      title: 'Access denied — network restriction',
      text: detail || 'You are not connecting from an allowed network for this exam.',
      color: 'text-red-400',
      sub: "Please connect to your institution's network (or VPN if permitted) and try again.",
    },
    expired: {
      icon: '⏰',
      title: 'This link has expired',
      text: 'Your exam access link is no longer valid.',
      color: 'text-amber-400',
      sub: 'Contact your instructor to request a new link.',
    },
    used: {
      icon: '🔒',
      title: 'This link has already been used',
      text: 'Each magic link can only be opened once.',
      color: 'text-red-400',
      sub: 'If you believe this is an error, contact your instructor immediately.',
    },
    error: {
      icon: '❌',
      title: 'Invalid link',
      text: detail || 'This link is not valid.',
      color: 'text-red-400',
      sub: 'Please check you copied the full URL from your email.',
    },
  };

  const s = states[status];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="text-6xl mb-5">{s.icon}</div>
        <h1 className={`text-xl font-bold mb-3 ${s.color}`}>{s.title}</h1>
        <p className="text-sm text-gray-400 mb-3 leading-relaxed">{s.text}</p>
        {'sub' in s && s.sub && <p className="text-xs text-gray-600 leading-relaxed">{s.sub}</p>}
        {status === 'checking' && (
          <div className="mt-6 flex justify-center">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
