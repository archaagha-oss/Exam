/**
 * AriaLive: invisible live region. Mount this once high in the tree and
 * call announce(message, 'polite' | 'assertive') from anywhere via the
 * exported hook to push a screen-reader announcement.
 *
 * Used for: timer milestones (5min, 1min), violation warnings, reconnect
 * status.
 */
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

type Politeness = 'polite' | 'assertive';

interface AriaLiveCtx {
  announce: (msg: string, politeness?: Politeness) => void;
}

const Ctx = createContext<AriaLiveCtx>({ announce: () => {} });

export function AriaLiveProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');

  const announce = useCallback((msg: string, politeness: Politeness = 'polite') => {
    if (politeness === 'assertive') setAssertive(msg);
    else setPolite(msg);
  }, []);

  return (
    <Ctx.Provider value={{ announce }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        {polite}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        {assertive}
      </div>
    </Ctx.Provider>
  );
}

export function useAriaLive() {
  return useContext(Ctx);
}
