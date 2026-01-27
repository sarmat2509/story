// Base color palette
export const colors = {
  // Primary (Sky Blue) - #0ea5e9
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',  // Main primary
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },
  
  // Neutral (Slate)
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',  // Main gray text
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  
  // Success
  success: {
    50: '#f0fdf4',
    500: '#10b981',
    600: '#059669',
  },
  
  // Error
  error: {
    50: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  
  // Warning
  warning: {
    50: '#fef3c7',
    500: '#f59e0b',
    600: '#d97706',
  },
  
  // Special
  white: '#ffffff',
  black: '#000000',
  
  // OAuth brands
  google: '#4285F4',
  apple: '#000000',
};

// Semantic colors (usage-based)
export const semanticColors = {
  // Backgrounds
  background: {
    primary: colors.white,
    secondary: colors.neutral[50],
    tertiary: colors.neutral[100],
    inverse: colors.neutral[900],
  },
  
  // Text
  text: {
    primary: colors.neutral[800],
    secondary: colors.neutral[600],
    tertiary: colors.neutral[500],
    disabled: colors.neutral[400],
    inverse: colors.white,
  },
  
  // Borders
  border: {
    light: colors.neutral[200],
    medium: colors.neutral[300],
    dark: colors.neutral[400],
  },
  
  // Interactive states
  interactive: {
    primary: colors.primary[500],
    primaryHover: colors.primary[600],
    primaryActive: colors.primary[700],
    secondary: colors.neutral[100],
    secondaryHover: colors.neutral[200],
  },
  
  // Status
  status: {
    success: colors.success[500],
    error: colors.error[600],
    warning: colors.warning[500],
  },
};
