// apps/student/src/components/AccessibilityToolbar.tsx
import { useAccessibility } from '../hooks/useAccessibility';

export default function AccessibilityToolbar() {
  const { fontSize, highContrast, reducedMotion, setFontSize, toggleHighContrast, toggleReducedMotion } = useAccessibility();

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-lg"
      role="toolbar"
      aria-label="Accessibility options"
    >
      {/* Font size */}
      <div className="flex items-center gap-1" role="group" aria-label="Font size">
        <button
          onClick={() => setFontSize(Math.max(14, fontSize - 2))}
          className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold transition-colors flex items-center justify-center"
          aria-label="Decrease font size"
          title="Decrease font size"
        >
          A−
        </button>
        <span className="text-xs text-gray-500 w-8 text-center font-mono">{fontSize}px</span>
        <button
          onClick={() => setFontSize(Math.min(22, fontSize + 2))}
          className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold transition-colors flex items-center justify-center"
          aria-label="Increase font size"
          title="Increase font size"
        >
          A+
        </button>
      </div>

      <div className="w-px h-5 bg-gray-700" />

      {/* High contrast */}
      <button
        onClick={toggleHighContrast}
        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors flex items-center justify-center ${
          highContrast ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
        }`}
        aria-label={`High contrast ${highContrast ? 'on' : 'off'}`}
        aria-pressed={highContrast}
        title="Toggle high contrast"
      >
        ◑
      </button>

      {/* Reduced motion */}
      <button
        onClick={toggleReducedMotion}
        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors flex items-center justify-center ${
          reducedMotion ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
        }`}
        aria-label={`Reduced motion ${reducedMotion ? 'on' : 'off'}`}
        aria-pressed={reducedMotion}
        title="Toggle reduced motion"
      >
        ⏸
      </button>
    </div>
  );
}
