import { API_URL } from '@/lib/api';

export function getPlaygroundMediaUrl(path?: string | null): string | null {
  if (!path) return null;

  if (/^(https?:|data:|blob:)/i.test(path)) {
    return path;
  }

  const relativePath = path
    .replace(/^\/+/, '')
    .replace(/^files\//, '')
    .replace(/^outputs?\//, '');

  return `${API_URL}/files/${relativePath}`;
}

export function getPlaygroundFileName(path: string): string {
  const cleanPath = path.split('?')[0];
  const parts = cleanPath.split('/');
  return parts[parts.length - 1] || path;
}
