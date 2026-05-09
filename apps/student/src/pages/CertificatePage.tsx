// apps/student/src/pages/CertificatePage.tsx
import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface CertData {
  id: string;
  studentName: string;
  examTitle: string;
  score: number;
  totalPoints: number;
  percentage: number;
  issuedAt: string;
}

export default function CertificatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const user = useAuthStore(s => s.user);
  const [cert, setCert] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get(`/assessment/sessions/${sessionId}/certificate`)
      .then(r => { setCert(r.data.data); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [sessionId]);

  function print() {
    window.print();
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading…</div>;
  if (notFound || !cert) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-4xl mb-3">🏅</p>
        <h2 className="text-lg font-bold mb-2">No certificate available</h2>
        <p className="text-gray-400 text-sm mb-4">Certificates are issued when the passing score is met and the exam is fully graded.</p>
        <Link to="/results" className="btn-ghost">← My Results</Link>
      </div>
    </div>
  );

  const date = new Date(cert.issuedAt);
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link to="/results" className="text-gray-500 hover:text-gray-300 text-sm">← My Results</Link>
          <button onClick={print} className="btn-primary text-sm">🖨 Print / Save as PDF</button>
        </div>

        {/* Certificate */}
        <div
          ref={certRef}
          className="bg-white text-gray-900 rounded-2xl overflow-hidden shadow-2xl"
          style={{ fontFamily: 'serif' }}
        >
          {/* Header band */}
          <div className="bg-gray-900 px-10 py-6 text-center">
            <div className="text-4xl mb-1">🏆</div>
            <p className="text-emerald-400 text-sm font-sans tracking-widest uppercase font-bold">Certificate of Achievement</p>
          </div>

          {/* Body */}
          <div className="px-12 py-10 text-center">
            <p className="text-sm text-gray-500 mb-1">This certifies that</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'serif' }}>{cert.studentName}</h2>

            <p className="text-gray-600 text-sm mb-1">has successfully completed</p>
            <h3 className="text-2xl font-bold text-gray-800 mb-6">{cert.examTitle}</h3>

            {/* Score badge */}
            <div className="inline-flex items-center gap-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-8 py-4 mb-8">
              <div className="text-center">
                <p className="text-4xl font-bold text-emerald-600">{cert.percentage}%</p>
                <p className="text-xs text-gray-500 mt-0.5">Score</p>
              </div>
              <div className="w-px h-10 bg-emerald-200" />
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-700">{cert.score}/{cert.totalPoints}</p>
                <p className="text-xs text-gray-500 mt-0.5">Points</p>
              </div>
            </div>

            {/* Seal row */}
            <div className="flex items-center justify-center gap-3 mt-2">
              <div className="flex-1 h-px bg-gray-200" />
              <div className="text-gray-400 text-3xl">◈</div>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <p className="text-xs text-gray-400 mt-4">Issued on {dateStr} · SecureExam Platform</p>
            <p className="text-xs text-gray-300 mt-1 font-mono">ID: {cert.id.slice(0, 16).toUpperCase()}</p>
          </div>

          {/* Footer band */}
          <div className="bg-gray-50 border-t border-gray-100 px-10 py-4 flex items-center justify-between">
            <p className="text-xs text-gray-400">🔒 Verified · SecureExam</p>
            <p className="text-xs text-gray-400">Not transferable</p>
          </div>
        </div>

        {/* Print styles */}
        <style>{`
          @media print {
            body { background: white !important; }
            .print\\:hidden { display: none !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
