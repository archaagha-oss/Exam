// apps/student/src/hooks/useAccessibility.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AccessibilityState {
  fontSize: number;       // base font size in px (14–22)
  highContrast: boolean;  // high contrast mode
  reducedMotion: boolean; // disable animations
  setFontSize: (size: number) => void;
  toggleHighContrast: () => void;
  toggleReducedMotion: () => void;
}

export const useAccessibility = create<AccessibilityState>()(
  persist(
    (set) => ({
      fontSize: 16,
      highContrast: false,
      reducedMotion: false,
      setFontSize: (fontSize) => set({ fontSize }),
      toggleHighContrast: () => set(s => ({ highContrast: !s.highContrast })),
      toggleReducedMotion: () => set(s => ({ reducedMotion: !s.reducedMotion })),
    }),
    { name: 'secureexam-a11y' }
  )
);
