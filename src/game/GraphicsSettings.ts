export type GraphicsQuality = 'PERFORMANCE' | 'BALANCED' | 'HIGH';

export interface GraphicsConfig {
  quality: GraphicsQuality;
  pixelRatioCap: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  softShadows: boolean;
}

const STORAGE_KEY = 'incasters_graphics_quality';

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsConfig> = {
  PERFORMANCE: {
    quality: 'PERFORMANCE',
    pixelRatioCap: 1.0, // Crisp 1:1 on 1080p, massive fill-rate savings for Adreno 618 / mobile
    shadowsEnabled: false,
    shadowMapSize: 512,
    softShadows: false
  },
  BALANCED: {
    quality: 'BALANCED',
    pixelRatioCap: 1.25,
    shadowsEnabled: true,
    shadowMapSize: 512,
    softShadows: false
  },
  HIGH: {
    quality: 'HIGH',
    pixelRatioCap: 1.5,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    softShadows: true
  }
};

/**
 * Detects whether the device is a mobile or handheld device (like Logitech G Cloud, Steam Deck, Android)
 * based on coarse pointer, maxTouchPoints, or screen size.
 */
export function isMobileOrHandheld(): boolean {
  if (typeof window === 'undefined') return false;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  const isSmall = window.innerWidth <= 1024;
  const ua = navigator.userAgent.toLowerCase();
  const isMobileUa = /android|iphone|ipad|ipod|mobile|handheld|quest/i.test(ua);
  return isCoarse || (hasTouch && isSmall) || isMobileUa;
}

export function loadGraphicsQuality(): GraphicsQuality {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'PERFORMANCE' || saved === 'BALANCED' || saved === 'HIGH') {
      return saved as GraphicsQuality;
    }
  } catch {
    // Ignore storage read errors
  }
  // Default handhelds / mobile to PERFORMANCE for guaranteed 60fps, desktop to BALANCED
  return isMobileOrHandheld() ? 'PERFORMANCE' : 'BALANCED';
}

export function saveGraphicsQuality(quality: GraphicsQuality): void {
  try {
    localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    // Ignore storage write errors
  }
}

export function getGraphicsConfig(quality: GraphicsQuality): GraphicsConfig {
  return GRAPHICS_PRESETS[quality] || GRAPHICS_PRESETS.BALANCED;
}
