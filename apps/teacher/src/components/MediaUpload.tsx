// apps/teacher/src/components/MediaUpload.tsx
import { useState, useRef } from 'react';
import api from '../lib/api';

interface Props {
  questionId: string;
  currentUrl?: string;
  onUpdate: (url: string | null) => void;
}

export default function MediaUpload({ questionId, currentUrl, onUpdate }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAudio = preview?.match(/\.(mp3|wav|ogg|webm|m4a)$/i) ||
    preview?.includes('audio');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10MB)');
      return;
    }

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post(`/media/questions/${questionId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data.data.url);
      onUpdate(data.data.url);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    if (!confirm('Remove this media attachment?')) return;
    await api.delete(`/media/questions/${questionId}`);
    setPreview(null);
    onUpdate(null);
  }

  return (
    <div className="space-y-2">
      {/* Current media preview */}
      {preview && (
        <div className="relative inline-block">
          {isAudio ? (
            <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
              <span className="text-2xl">🎵</span>
              <audio controls src={preview} className="max-w-xs h-8" />
              <button
                onClick={handleRemove}
                className="text-red-400 hover:text-red-300 text-xs ml-2"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="relative group">
              <img
                src={preview}
                alt="Question media"
                className="max-h-40 max-w-full rounded-lg border border-gray-700 object-contain"
              />
              <button
                onClick={handleRemove}
                className="absolute top-1 right-1 bg-red-900/80 text-red-300 text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload control */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-ghost text-xs py-1.5"
        >
          {uploading ? '⏳ Uploading…' : preview ? '🔄 Replace media' : '📎 Attach image or audio'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,audio/*"
          onChange={handleFile}
          className="hidden"
        />
        <span className="text-xs text-gray-600">JPG, PNG, GIF, WebP, MP3, WAV · max 10MB</span>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
