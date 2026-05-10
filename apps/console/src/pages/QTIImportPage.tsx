// apps/console/src/pages/QTIImportPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import RichText from '../components/RichText';

interface ParsedQuestion {
  body: string;
  type: string;
  options: { id: string; text: string }[];
  correctIds: string[];
  explanation?: string;
  points: number;
  tags: string[];
  selected: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  MCQ: 'Multiple choice', MCQ_MULTI: 'Multi-select',
  TRUE_FALSE: 'True / False', SHORT_TEXT: 'Short answer', ESSAY: 'Essay',
};

const SAMPLE_QTI = `<?xml version="1.0" encoding="UTF-8"?>
<assessmentTest xmlns="http://www.imsglobal.org/xsd/imsqti_v2p2">
  <assessmentItem identifier="q1" title="Water Boiling Point">
    <itemBody>
      <prompt>At what temperature does water boil at sea level?</prompt>
    </itemBody>
    <choiceInteraction maxChoices="1" responseIdentifier="RESPONSE">
      <simpleChoice identifier="A">50°C</simpleChoice>
      <simpleChoice identifier="B">100°C</simpleChoice>
      <simpleChoice identifier="C">150°C</simpleChoice>
      <simpleChoice identifier="D">200°C</simpleChoice>
    </choiceInteraction>
    <responseDeclaration identifier="RESPONSE">
      <correctResponse><value>B</value></correctResponse>
    </responseDeclaration>
  </assessmentItem>
  <assessmentItem identifier="q2" title="Earth Position">
    <itemBody>
      <prompt>Earth is the third planet from the sun.</prompt>
    </itemBody>
    <choiceInteraction maxChoices="1" responseIdentifier="RESPONSE">
      <simpleChoice identifier="true">True</simpleChoice>
      <simpleChoice identifier="false">False</simpleChoice>
    </choiceInteraction>
    <responseDeclaration identifier="RESPONSE">
      <correctResponse><value>true</value></correctResponse>
    </responseDeclaration>
  </assessmentItem>
</assessmentTest>`;

export default function QTIImportPage() {
  const navigate = useNavigate();
  const [xml, setXml] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  async function parse() {
    if (!xml.trim()) { setError('Paste or upload QTI XML first.'); return; }
    setParsing(true); setError(''); setQuestions([]); setSavedCount(null);
    try {
      const { data } = await api.post('/qti/import', { xml });
      setQuestions(data.data.questions.map((q: any) => ({ ...q, selected: true })));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Parse failed. Check the XML format.');
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    const toSave = questions.filter(q => q.selected);
    if (!toSave.length) { setError('Select at least one question.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/qti/import/save', {
        questions: toSave.map(({ selected, ...q }) => q),
      });
      setSavedCount(data.data.saved);
      setQuestions(prev => prev.map(q => q.selected ? { ...q, selected: false } : q));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setXml((ev.target?.result as string) || '');
    reader.readAsText(file);
  }

  const selectedCount = questions.filter(q => q.selected).length;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/questions')} className="text-gray-500 hover:text-gray-300 text-sm">← Question Bank</button>
        <div>
          <h1 className="text-2xl font-bold">QTI Import</h1>
          <p className="text-gray-400 text-sm mt-0.5">Import questions from IMS QTI 1.2 or 2.x XML files</p>
        </div>
      </div>

      {/* Format info */}
      <div className="card p-4 mb-6 border-blue-900 bg-blue-950/20">
        <p className="text-sm text-blue-200 leading-relaxed">
          <strong className="text-blue-300">Supported formats:</strong>{' '}
          IMS QTI 2.1 / 2.2 (<code className="text-blue-400">assessmentItem</code>) and QTI 1.2 (<code className="text-blue-400">item</code>).
          Exports from Moodle, Canvas, Blackboard, and most LMSes are compatible.
          Supported question types: MCQ, multi-select, true/false, short answer.
        </p>
      </div>

      {/* Upload */}
      <div className="card p-5 mb-5 space-y-4">
        <div>
          <label className="label">Upload QTI file (.xml, .zip not yet supported)</label>
          <input type="file" accept=".xml,text/xml,application/xml" onChange={handleFile} className="input py-2 cursor-pointer" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Or paste XML directly</label>
            <button onClick={() => setXml(SAMPLE_QTI)} className="text-xs text-emerald-500 hover:text-emerald-400">
              Load sample
            </button>
          </div>
          <textarea
            className="input h-40 font-mono text-xs resize-none"
            placeholder="Paste QTI XML here…"
            value={xml}
            onChange={e => setXml(e.target.value)}
          />
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        <button onClick={parse} disabled={parsing || !xml.trim()} className="btn-primary w-full py-3">
          {parsing ? '⟳ Parsing XML…' : '🔍 Parse Questions'}
        </button>
      </div>

      {/* Results */}
      {questions.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">{questions.length} questions found</h2>
              <p className="text-xs text-gray-500 mt-0.5">Review before saving. Imported questions get the tag <code className="text-gray-400">qti-import</code>.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setQuestions(p => p.map(q => ({ ...q, selected: true })))} className="text-xs text-gray-400 hover:text-white">All</button>
              <button onClick={() => setQuestions(p => p.map(q => ({ ...q, selected: false })))} className="text-xs text-gray-400 hover:text-white">None</button>
              <button onClick={save} disabled={saving || selectedCount === 0} className="btn-primary">
                {saving ? 'Saving…' : `💾 Save ${selectedCount} to Bank`}
              </button>
            </div>
          </div>

          {savedCount !== null && (
            <div className="bg-emerald-950 border border-emerald-800 rounded-xl px-5 py-4 mb-4">
              <p className="text-emerald-300 font-medium">✓ {savedCount} question{savedCount !== 1 ? 's' : ''} saved to question bank!</p>
              <button onClick={() => navigate('/questions')} className="text-xs text-emerald-500 hover:text-emerald-400 mt-1">
                View question bank →
              </button>
            </div>
          )}

          <div className="space-y-3">
            {questions.map((q, i) => (
              <div
                key={i}
                className={`card p-4 transition-all ${q.selected ? 'border-emerald-800' : 'opacity-50 border-gray-800'}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => setQuestions(p => p.map((x, xi) => xi === i ? { ...x, selected: !x.selected } : x))}
                    className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition-colors ${
                      q.selected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600'
                    }`}
                  >
                    {q.selected && <span className="text-black text-xs font-bold">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                        {TYPE_LABELS[q.type] ?? q.type}
                      </span>
                      <span className="text-xs text-gray-500">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-sm mb-2 leading-relaxed"><RichText text={q.body} /></p>
                    {q.options.length > 0 && (
                      <div className="space-y-1">
                        {q.options.map(opt => (
                          <div key={opt.id} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                            q.correctIds.includes(opt.id) ? 'bg-emerald-950/60 text-emerald-300' : 'text-gray-500'
                          }`}>
                            <span className="font-mono w-4">{opt.id.toUpperCase()}</span>
                            <span>{opt.text}</span>
                            {q.correctIds.includes(opt.id) && <span className="ml-auto">✓ correct</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {q.type === 'SHORT_TEXT' && (
                      <p className="text-xs text-gray-500 italic mt-1">Open-ended — will require manual grading</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Sticky bottom bar */}
          <div className="sticky bottom-0 mt-6 card p-4 flex items-center justify-between">
            <span className="text-sm text-gray-400">{selectedCount} of {questions.length} selected</span>
            <button onClick={save} disabled={saving || selectedCount === 0} className="btn-primary">
              {saving ? 'Saving…' : `💾 Save ${selectedCount} to Bank`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
