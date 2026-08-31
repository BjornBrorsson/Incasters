import { type CustomMapData, sanitizeCustomMap, validateCustomMap } from './CustomMap';

/**
 * Universal Base64URL encode (works in Browser & Node/TSX test environments).
 */
export function toBase64Url(str: string): string {
  let b64: string;
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    // UTF-8 safe encode for browser
    b64 = window.btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } else if (typeof (globalThis as any).Buffer !== 'undefined') {
    b64 = (globalThis as any).Buffer.from(str, 'utf-8').toString('base64');
  } else {
    throw new Error('No Base64 encoder available');
  }

  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Universal Base64URL decode (works in Browser & Node/TSX test environments).
 */
export function fromBase64Url(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const raw = window.atob(b64);
    return decodeURIComponent(
      Array.prototype.map.call(raw, (c: string) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')
    );
  } else if (typeof (globalThis as any).Buffer !== 'undefined') {
    return (globalThis as any).Buffer.from(b64, 'base64').toString('utf-8');
  } else {
    throw new Error('No Base64 decoder available');
  }
}

/**
 * Simple hash checksum for verifying state integrity.
 */
function simpleChecksum(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export interface StateShareEnvelope {
  v: number; // version
  cs: number; // checksum
  d: any; // payload data
}

const SHORT_CODE_STORAGE_KEY = 'incasters_share_codes_v1';

/**
 * Encodes a CustomMapData object into a compact, URL-safe State Share payload.
 */
export function encodeStateShare(map: CustomMapData): string {
  const sanitized = sanitizeCustomMap(map);
  const jsonStr = JSON.stringify(sanitized);
  const cs = simpleChecksum(jsonStr);

  const envelope: StateShareEnvelope = {
    v: 1,
    cs,
    d: sanitized
  };

  return toBase64Url(JSON.stringify(envelope));
}

/**
 * Decodes a State Share payload back into a validated CustomMapData object.
 */
export function decodeStateShare(payload: string): CustomMapData | null {
  if (!payload || typeof payload !== 'string') return null;

  try {
    const jsonEnvelope = fromBase64Url(payload.trim());
    const envelope: StateShareEnvelope = JSON.parse(jsonEnvelope);

    if (!envelope || envelope.v !== 1 || !envelope.d) {
      return null;
    }

    const mapData = envelope.d;
    const { valid } = validateCustomMap(mapData);
    if (!valid) {
      return null;
    }

    return sanitizeCustomMap(mapData);
  } catch (err) {
    console.warn('Failed to decode state share payload', err);
    return null;
  }
}

/**
 * Extracts State Share data from a URL string or current window.location.
 */
export function parseStateShareFromUrl(urlStr?: string): CustomMapData | null {
  let hash = '';
  let search = '';

  if (urlStr) {
    try {
      const u = new URL(urlStr, 'http://localhost');
      hash = u.hash;
      search = u.search;
    } catch {
      // Fallback manual parse
      const hashIdx = urlStr.indexOf('#');
      if (hashIdx !== -1) hash = urlStr.slice(hashIdx);
      const queryIdx = urlStr.indexOf('?');
      if (queryIdx !== -1) search = urlStr.slice(queryIdx, hashIdx !== -1 ? hashIdx : undefined);
    }
  } else if (typeof window !== 'undefined') {
    hash = window.location.hash || '';
    search = window.location.search || '';
  }

  // 1. Check hash for #share= or #state= or #map=
  if (hash) {
    const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(cleanHash);
    const payload = params.get('share') || params.get('state') || params.get('map');
    if (payload) {
      const decoded = decodeStateShare(payload);
      if (decoded) return decoded;
    }
  }

  // 2. Check query params for ?share= or ?state= or ?map=
  if (search) {
    const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(cleanSearch);
    const payload = params.get('share') || params.get('state') || params.get('map');
    if (payload) {
      const decoded = decodeStateShare(payload);
      if (decoded) return decoded;
    }

    // Check for short code e.g. ?code=ST-XXXX
    const code = params.get('code');
    if (code) {
      const fromCode = resolveShareCode(code);
      if (fromCode) return fromCode;
    }
  }

  return null;
}

/**
 * Generates a full State Share URL link.
 */
export function generateShareUrl(map: CustomMapData, baseUrl?: string): string {
  const payload = encodeStateShare(map);
  const base = baseUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://incasters.app/');
  const cleanBase = base.split('#')[0].split('?')[0];
  return `${cleanBase}#share=${payload}`;
}

const shareCodeMemoryStore: Record<string, string> = {};

function safeGetShareItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return shareCodeMemoryStore[key] || null;
}

function safeSetShareItem(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  shareCodeMemoryStore[key] = val;
}

/**
 * Generates a short 6-character State Share code and stores it in the local share cache.
 */
export function generateShareCode(map: CustomMapData): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const code = `ST-${rand}`;

  try {
    const raw = safeGetShareItem(SHORT_CODE_STORAGE_KEY) || '{}';
    const store = JSON.parse(raw);
    store[code] = sanitizeCustomMap(map);
    safeSetShareItem(SHORT_CODE_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('Failed to cache short share code in storage', e);
  }

  return code;
}

/**
 * Resolves a 6-character State Share code from the local store.
 */
export function resolveShareCode(code: string): CustomMapData | null {
  const clean = code.trim().toUpperCase();
  try {
    const raw = safeGetShareItem(SHORT_CODE_STORAGE_KEY) || '{}';
    const store = JSON.parse(raw);
    const found = store[clean] || store[clean.replace(/[^A-Z0-9]/g, '')] || store[`ST-${clean.replace(/[^A-Z0-9]/g, '')}`];
    return found ? sanitizeCustomMap(found) : null;
  } catch {
    return null;
  }
}

/**
 * Share helper providing Web Share API or clipboard copy fallback.
 */
export async function shareCustomMap(map: CustomMapData): Promise<{ success: boolean; method: 'web-share' | 'clipboard' | 'failed'; message: string }> {
  const url = generateShareUrl(map);
  const title = `Incasters: ${map.title}`;
  const text = `Play this custom ${map.mode === 'TRIAL' ? 'Trickshot Challenge' : 'Arena Map'} created by ${map.author}!`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title,
        text,
        url
      });
      return { success: true, method: 'web-share', message: 'Shared successfully!' };
    } catch (err: any) {
      // If user cancelled, don't fail, fall back to clipboard
      if (err.name === 'AbortError') {
        return { success: false, method: 'failed', message: 'Share cancelled' };
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(url);
      return { success: true, method: 'clipboard', message: 'State Share link copied to clipboard!' };
    } catch {
      // Fallback
    }
  }

  return { success: false, method: 'failed', message: 'Could not copy automatically. Please copy the link manually.' };
}
