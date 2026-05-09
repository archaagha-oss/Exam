// apps/student/src/hooks/useDeviceFingerprint.ts
import { useCallback } from 'react';
import api from '../lib/api';

// Generates a lightweight browser fingerprint from stable characteristics.
// We avoid heavy libraries — this is enough to detect device swaps.
async function collectFingerprint(): Promise<{ hash: string; components: Record<string, any> }> {
  const components: Record<string, any> = {
    userAgent:           navigator.userAgent,
    language:            navigator.language,
    platform:            navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    timezone:            Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenRes:           `${screen.width}x${screen.height}x${screen.colorDepth}`,
    cookieEnabled:       navigator.cookieEnabled,
    doNotTrack:          navigator.doNotTrack,
    touchPoints:         navigator.maxTouchPoints,
  };

  // Canvas fingerprint — very stable, hard to spoof
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f00';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('SecureExam 🔒', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('SecureExam 🔒', 4, 17);
      components.canvasHash = canvas.toDataURL().slice(-50);
    }
  } catch { /* canvas blocked */ }

  // WebGL renderer — identifies GPU/driver
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        components.webglVendor   = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        components.webglRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch { /* webgl blocked */ }

  // Hash the combined string
  const str = JSON.stringify(components);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

  return { hash, components };
}

export function useDeviceFingerprint() {
  const submit = useCallback(async (sessionId: string) => {
    try {
      const { hash, components } = await collectFingerprint();
      const res = await api.post(`/security/sessions/${sessionId}/fingerprint`, {
        fingerprint: hash,
        components: {
          userAgent:           components.userAgent,
          screenRes:           components.screenRes,
          timezone:            components.timezone,
          language:            components.language,
          platform:            components.platform,
          colorDepth:          screen.colorDepth,
          hardwareConcurrency: components.hardwareConcurrency,
        },
      });
      return res.data.data.alert as string | null;
    } catch {
      return null; // non-critical — don't break the exam
    }
  }, []);

  return { submit };
}
