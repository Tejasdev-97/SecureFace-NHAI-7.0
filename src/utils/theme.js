/**
 * theme.js
 * Central design system for SecureFace
 * Colors, typography, spacing, and React Native Paper theme config
 */

import {DefaultTheme} from 'react-native-paper';

// ─── Color Palette ───────────────────────────────────────────────────────────
export const COLORS = {
  // Brand
  primary: '#1565C0',       // NHAI Blue
  primaryDark: '#003c8f',
  primaryLight: '#5e92f3',
  secondary: '#FF6F00',     // Amber accent
  secondaryLight: '#ffa040',

  // Semantic
  success: '#2E7D32',
  successLight: '#E8F5E9',
  error: '#C62828',
  errorLight: '#FFEBEE',
  warning: '#F57F17',
  warningLight: '#FFF8E1',
  info: '#01579B',
  infoLight: '#E1F5FE',

  // Neutral
  background: '#F4F6F9',
  surface: '#FFFFFF',
  surfaceVariant: '#EEF2F7',
  border: '#D0D7E3',
  divider: '#E8ECF0',

  // Text
  text: '#1A1F36',
  textSecondary: '#6B7280',
  textDisabled: '#B0B7C3',
  textOnPrimary: '#FFFFFF',

  // Status badges
  badgeEnrolled: '#1565C0',
  badgePending: '#F57F17',
  badgeSynced: '#2E7D32',
  badgeFailed: '#C62828',

  // Overlay
  overlay: 'rgba(0,0,0,0.5)',
  cameraGuide: 'rgba(21,101,192,0.7)',
};

// ─── Typography ──────────────────────────────────────────────────────────────
export const FONTS = {
  regular: {fontFamily: 'Roboto', fontWeight: '400'},
  medium: {fontFamily: 'Roboto', fontWeight: '500'},
  bold: {fontFamily: 'Roboto', fontWeight: '700'},
  light: {fontFamily: 'Roboto', fontWeight: '300'},
};

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
};

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

// ─── Border Radius ───────────────────────────────────────────────────────────
export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
};

// ─── React Native Paper Theme ────────────────────────────────────────────────
export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    accent: COLORS.secondary,
    background: COLORS.background,
    surface: COLORS.surface,
    text: COLORS.text,
    error: COLORS.error,
  },
  // Navigation theme (used by NavigationContainer)
  navigation: {
    dark: false,
    colors: {
      primary: COLORS.primary,
      background: COLORS.background,
      card: COLORS.surface,
      text: COLORS.text,
      border: COLORS.border,
      notification: COLORS.secondary,
    },
  },
};

export default theme;
