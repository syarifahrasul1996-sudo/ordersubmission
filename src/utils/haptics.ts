/**
 * Haptic Feedback API Utility
 * Provides tactile haptic feedback using the Web Vibration API (navigator.vibrate).
 * Safely falls back on unsupported devices (like iOS Safari, which doesn't support navigator.vibrate,
 * or desktop browsers) and respects user toggle preferences.
 */

const STORAGE_KEY = 'haptic_feedback_enabled';

// Standardized vibration patterns (in milliseconds)
// Pattern format: [vibrate, pause, vibrate, pause, ...]
export const HAPTIC_PATTERNS = {
  light: 12,          // Light tap for navigation and small buttons
  medium: 25,         // Medium tap for important buttons
  heavy: 45,          // Strong impact for primary submission or destructive actions
  selection: 8,       // Very light tick for slider adjustments or dial changes
  success: [15, 30, 20], // Crisp double-tap for successful actions or saves
  warning: [30, 50, 30], // Dual distinct pulses for warning states
  error: [50, 40, 50, 40, 60] // Urgent series of pulses for validation errors
};

export type HapticType = keyof typeof HAPTIC_PATTERNS;

/**
 * Checks if the browser and device support the Vibration API
 */
export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Retrieves the user's preference for haptic feedback (defaults to true)
 */
export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

/**
 * Saves the user's preference for haptic feedback
 */
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

/**
 * Triggers a haptic feedback pulse of a specific type/pattern
 * @param type The type of haptic feedback to trigger
 */
export function triggerHaptic(type: HapticType): boolean {
  if (!isHapticsSupported() || !isHapticsEnabled()) {
    return false;
  }

  try {
    const pattern = HAPTIC_PATTERNS[type];
    return navigator.vibrate(pattern);
  } catch (err) {
    console.warn('[Haptics] Failed to trigger vibration:', err);
    return false;
  }
}
