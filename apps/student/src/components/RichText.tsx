// apps/teacher/src/components/RichText.tsx
// Renders question body text with LaTeX math support.
// Supports inline math: $...$  and display math: $$...$$
// Falls back to plain text if KaTeX not available.

import { useMemo } from 'react';

interface Props {
  text: string;
  className?: string;
}

function renderLatex(text: string): string {
  try {
    // Dynamic import is not available in render, so we use a synchronous approach
    // KaTeX is loaded as a global via CDN in index.html for the teacher portal
    const katex = (window as any).katex;
    if (!katex) return escapeHtml(text);

    let result = '';
    let i = 0;

    while (i < text.length) {
      // Display math $$...$$
      if (text[i] === '$' && text[i + 1] === '$') {
        const end = text.indexOf('$$', i + 2);
        if (end !== -1) {
          const math = text.slice(i + 2, end);
          try {
            result += katex.renderToString(math, { displayMode: true, throwOnError: false });
          } catch {
            result += escapeHtml(`$$${math}$$`);
          }
          i = end + 2;
          continue;
        }
      }
      // Inline math $...$
      if (text[i] === '$') {
        const end = text.indexOf('$', i + 1);
        if (end !== -1 && end > i + 1) {
          const math = text.slice(i + 1, end);
          try {
            result += katex.renderToString(math, { displayMode: false, throwOnError: false });
          } catch {
            result += escapeHtml(`$${math}$`);
          }
          i = end + 1;
          continue;
        }
      }
      // Bold **text**
      if (text[i] === '*' && text[i + 1] === '*') {
        const end = text.indexOf('**', i + 2);
        if (end !== -1) {
          result += `<strong>${escapeHtml(text.slice(i + 2, end))}</strong>`;
          i = end + 2;
          continue;
        }
      }
      result += escapeHtml(text[i]);
      i++;
    }

    return result;
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function RichText({ text, className = '' }: Props) {
  const html = useMemo(() => renderLatex(text), [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
