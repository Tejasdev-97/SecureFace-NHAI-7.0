/**
 * helpers.js
 * Common utility functions used across the app
 */

import {Platform} from 'react-native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

// ─── Camera Permission ────────────────────────────────────────────────────────

/**
 * Request camera permission from the OS.
 * @returns {Promise<boolean>} true if granted
 */
export async function requestCameraPermission() {
  const permission =
    Platform.OS === 'ios'
      ? PERMISSIONS.IOS.CAMERA
      : PERMISSIONS.ANDROID.CAMERA;

  const status = await check(permission);
  if (status === RESULTS.GRANTED) {
    return true;
  }
  if (status === RESULTS.DENIED) {
    const result = await request(permission);
    return result === RESULTS.GRANTED;
  }
  return false; // blocked or unavailable
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Format a confidence score (0–1) as percentage string.
 */
export function formatConfidence(score) {
  if (!score && score !== 0) {return '—';}
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Truncate a string to maxLen characters, adding ellipsis.
 */
export function truncate(str, maxLen = 30) {
  if (!str) {return '';}
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

/**
 * Pad a number with leading zeros.
 * e.g. padZero(5, 3) → "005"
 */
export function padZero(num, length = 2) {
  return String(num).padStart(length, '0');
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate personnel ID format: alphanumeric, dashes allowed, 3–20 chars.
 */
export function isValidPersonnelId(id) {
  return /^[A-Z0-9\-]{3,20}$/.test(id);
}

/**
 * Validate that a name is non-empty and reasonable length.
 */
export function isValidName(name) {
  return name && name.trim().length >= 2 && name.trim().length <= 50;
}

// ─── Embedding Utilities ──────────────────────────────────────────────────────

/**
 * Average multiple embeddings into one (for multi-capture enrollment).
 * Each embedding is a number[].
 */
export function averageEmbeddings(embeddings) {
  if (!embeddings || embeddings.length === 0) {return [];}
  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length;
  }
  // L2-normalize the averaged vector
  const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? avg : avg.map(v => v / norm);
}

// ─── Device Info ──────────────────────────────────────────────────────────────

/**
 * Generate a stable device identifier from platform constants.
 * Used as the device ID for sync payloads.
 */
export function generateDeviceId() {
  const now = Date.now();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  const platform = Platform.OS.toUpperCase();
  return `${platform}_${rand}_${now}`;
}

/**
 * Generate a unique ID without requiring native crypto module.
 */
export function generateUniqueId(prefix = '') {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix ? prefix + '_' : ''}${now}_${rand}`;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/**
 * Return ISO date string for today at midnight (for "today's" queries).
 */
export function todayStartISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Check if a date string is within the last N minutes.
 */
export function isWithinMinutes(isoString, minutes) {
  const diff = Date.now() - new Date(isoString).getTime();
  return diff < minutes * 60 * 1000;
}
