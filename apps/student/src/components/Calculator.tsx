// apps/student/src/components/Calculator.tsx
import { useState, useCallback } from 'react';

type CalcType = 'basic' | 'scientific';

interface Props {
  type: CalcType;
  onClose: () => void;
}

export default function Calculator({ type, onClose }: Props) {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState('');
  const [op, setOp] = useState('');
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [memory, setMemory] = useState(0);
  const [angleMode, setAngleMode] = useState<'deg' | 'rad'>('deg');
  const [isShift, setIsShift] = useState(false);

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const inputDigit = useCallback((d: string) => {
    if (waitingForOperand) {
      setDisplay(d);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? d : display + d);
    }
  }, [display, waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) { setDisplay('0.'); setWaitingForOperand(false); return; }
    if (!display.includes('.')) setDisplay(display + '.');
  }, [display, waitingForOperand]);

  const handleOp = useCallback((nextOp: string) => {
    const val = parseFloat(display);
    if (prev && !waitingForOperand) {
      const p = parseFloat(prev);
      let result = p;
      switch (op) {
        case '+': result = p + val; break;
        case '−': result = p - val; break;
        case '×': result = p * val; break;
        case '÷': result = val !== 0 ? p / val : NaN; break;
        case 'xʸ': result = Math.pow(p, val); break;
      }
      setDisplay(String(isNaN(result) ? 'Error' : +result.toPrecision(12)));
      setPrev(String(isNaN(result) ? 0 : +result.toPrecision(12)));
    } else {
      setPrev(String(val));
    }
    setOp(nextOp);
    setWaitingForOperand(true);
  }, [display, prev, op, waitingForOperand]);

  const calculate = useCallback(() => {
    if (!op || !prev) return;
    handleOp('');
    setOp('');
    setPrev('');
    setWaitingForOperand(false);
  }, [handleOp, op, prev]);

  const unary = useCallback((fn: string) => {
    const val = parseFloat(display);
    const a = angleMode === 'deg' ? toRad(val) : val;
    let result: number;
    switch (fn) {
      case 'sin': result = Math.sin(a); break;
      case 'cos': result = Math.cos(a); break;
      case 'tan': result = Math.tan(a); break;
      case 'asin': result = angleMode === 'deg' ? (Math.asin(val) * 180) / Math.PI : Math.asin(val); break;
      case 'acos': result = angleMode === 'deg' ? (Math.acos(val) * 180) / Math.PI : Math.acos(val); break;
      case 'atan': result = angleMode === 'deg' ? (Math.atan(val) * 180) / Math.PI : Math.atan(val); break;
      case 'ln': result = Math.log(val); break;
      case 'log': result = Math.log10(val); break;
      case '√': result = Math.sqrt(val); break;
      case 'x²': result = val * val; break;
      case 'x³': result = val * val * val; break;
      case '1/x': result = 1 / val; break;
      case 'n!': result = factorial(Math.round(val)); break;
      case '±': result = -val; break;
      case 'eˣ': result = Math.exp(val); break;
      case '10ˣ': result = Math.pow(10, val); break;
      default: return;
    }
    setDisplay(String(isNaN(result) || !isFinite(result) ? 'Error' : +result.toPrecision(10)));
    setWaitingForOperand(true);
  }, [display, angleMode]);

  function factorial(n: number): number {
    if (n < 0 || n > 170) return NaN;
    if (n === 0 || n === 1) return 1;
    return n * factorial(n - 1);
  }

  const clear = () => { setDisplay('0'); setPrev(''); setOp(''); setWaitingForOperand(false); };
  const backspace = () => { setDisplay(display.length > 1 ? display.slice(0, -1) : '0'); };

  // Button class helpers
  const btn = 'h-10 rounded-lg text-sm font-medium transition-all active:scale-95 select-none cursor-pointer flex items-center justify-center';
  const numBtn = `${btn} bg-gray-700 hover:bg-gray-600 text-gray-100`;
  const opBtn  = `${btn} bg-gray-800 hover:bg-gray-700 text-amber-400`;
  const fnBtn  = `${btn} bg-gray-900 hover:bg-gray-800 text-blue-400 text-xs`;
  const eqBtn  = `${btn} bg-amber-500 hover:bg-amber-400 text-black font-bold`;
  const memBtn = `${btn} bg-gray-900 hover:bg-gray-800 text-purple-400 text-xs`;

  return (
    <div
      className="fixed bottom-20 right-4 z-50 bg-gray-950 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
      style={{ width: type === 'scientific' ? 320 : 220 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-medium">
          {type === 'scientific' ? 'Scientific Calculator' : 'Basic Calculator'}
        </span>
        {type === 'scientific' && (
          <button
            onClick={() => setAngleMode(m => m === 'deg' ? 'rad' : 'deg')}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              angleMode === 'deg'
                ? 'border-blue-800 text-blue-400 bg-blue-950'
                : 'border-gray-700 text-gray-400'
            }`}
          >
            {angleMode.toUpperCase()}
          </button>
        )}
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none ml-2">✕</button>
      </div>

      {/* Display */}
      <div className="px-4 py-3 bg-gray-900">
        <div className="text-xs text-gray-600 h-4 text-right font-mono">
          {prev} {op}
        </div>
        <div className="text-2xl font-mono font-bold text-right text-gray-100 overflow-hidden text-ellipsis whitespace-nowrap">
          {display}
        </div>
      </div>

      {/* Keypad */}
      <div className="p-3 space-y-1.5">
        {type === 'scientific' && (
          <>
            {/* Memory row */}
            <div className="grid grid-cols-5 gap-1.5">
              {['MC','MR','M+','M−','MS'].map(m => (
                <button key={m} className={memBtn} onClick={() => {
                  const v = parseFloat(display);
                  if (m === 'MC') setMemory(0);
                  else if (m === 'MR') { setDisplay(String(memory)); setWaitingForOperand(true); }
                  else if (m === 'M+') setMemory(memory + v);
                  else if (m === 'M−') setMemory(memory - v);
                  else if (m === 'MS') setMemory(v);
                }}>{m}</button>
              ))}
            </div>

            {/* Scientific row 1 */}
            <div className="grid grid-cols-5 gap-1.5">
              <button className={fnBtn} onClick={() => setIsShift(s => !s)}
                style={{ background: isShift ? '#1e3a5f' : undefined, color: isShift ? '#93c5fd' : undefined }}>
                2ⁿᵈ
              </button>
              <button className={fnBtn} onClick={() => unary(isShift ? 'asin' : 'sin')}>{isShift ? 'sin⁻¹' : 'sin'}</button>
              <button className={fnBtn} onClick={() => unary(isShift ? 'acos' : 'cos')}>{isShift ? 'cos⁻¹' : 'cos'}</button>
              <button className={fnBtn} onClick={() => unary(isShift ? 'atan' : 'tan')}>{isShift ? 'tan⁻¹' : 'tan'}</button>
              <button className={fnBtn} onClick={() => unary('n!')}>n!</button>
            </div>

            {/* Scientific row 2 */}
            <div className="grid grid-cols-5 gap-1.5">
              <button className={fnBtn} onClick={() => { setDisplay(String(Math.PI)); setWaitingForOperand(true); }}>π</button>
              <button className={fnBtn} onClick={() => { setDisplay(String(Math.E)); setWaitingForOperand(true); }}>e</button>
              <button className={fnBtn} onClick={() => unary(isShift ? 'eˣ' : 'ln')}>{isShift ? 'eˣ' : 'ln'}</button>
              <button className={fnBtn} onClick={() => unary(isShift ? '10ˣ' : 'log')}>{isShift ? '10ˣ' : 'log'}</button>
              <button className={fnBtn} onClick={() => handleOp('xʸ')}>xʸ</button>
            </div>

            {/* Scientific row 3 */}
            <div className="grid grid-cols-5 gap-1.5">
              <button className={fnBtn} onClick={() => unary('x²')}>x²</button>
              <button className={fnBtn} onClick={() => unary('x³')}>x³</button>
              <button className={fnBtn} onClick={() => unary('√')}>√</button>
              <button className={fnBtn} onClick={() => unary('1/x')}>1/x</button>
              <button className={fnBtn} onClick={() => unary('±')}>±</button>
            </div>
          </>
        )}

        {/* Standard rows */}
        <div className="grid grid-cols-4 gap-1.5">
          <button className={`${btn} bg-gray-800 text-red-400 hover:bg-red-950`} onClick={clear}>AC</button>
          <button className={`${btn} bg-gray-800 text-gray-300 hover:bg-gray-700`} onClick={backspace}>⌫</button>
          <button className={opBtn} onClick={() => unary('±')}>±</button>
          <button className={opBtn} onClick={() => handleOp('÷')}>÷</button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {['7','8','9'].map(d => <button key={d} className={numBtn} onClick={() => inputDigit(d)}>{d}</button>)}
          <button className={opBtn} onClick={() => handleOp('×')}>×</button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {['4','5','6'].map(d => <button key={d} className={numBtn} onClick={() => inputDigit(d)}>{d}</button>)}
          <button className={opBtn} onClick={() => handleOp('−')}>−</button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {['1','2','3'].map(d => <button key={d} className={numBtn} onClick={() => inputDigit(d)}>{d}</button>)}
          <button className={opBtn} onClick={() => handleOp('+')}>+</button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <button className={`${numBtn} col-span-2`} onClick={() => inputDigit('0')}>0</button>
          <button className={numBtn} onClick={inputDecimal}>.</button>
          <button className={eqBtn} onClick={calculate}>=</button>
        </div>
      </div>
    </div>
  );
}
