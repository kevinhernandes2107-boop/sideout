// Palette inspired by the official NCAA/FIVB match volleyball (Mikasa V200W):
// white panels with royal blue and gold trim.
export interface ThemeColors {
  navy: string;
  blue: string;
  blueDark: string;
  gold: string;
  goldDark: string;
  white: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  danger: string;
  success: string;
}

export const lightColors: ThemeColors = {
  navy: '#0B2265',
  blue: '#0057B8',
  blueDark: '#00459A',
  gold: '#FFC72C',
  goldDark: '#E6A700',
  white: '#FFFFFF',
  background: '#F4F6FB',
  surface: '#FFFFFF',
  border: '#E2E6F0',
  text: '#14213D',
  textMuted: '#5B6478',
  danger: '#D7263D',
  success: '#1E8E5A',
};

export const darkColors: ThemeColors = {
  navy: '#AFC2FF',
  blue: '#5B9BFF',
  blueDark: '#3D7AE0',
  gold: '#FFC72C',
  goldDark: '#E6A700',
  white: '#FFFFFF',
  background: '#0C1220',
  surface: '#161F32',
  border: '#2A3550',
  text: '#EDF1FA',
  textMuted: '#93A0BD',
  danger: '#FF5C7A',
  success: '#34D399',
};

// Kept for any leftover static references — prefer useTheme() in components.
export const Colors = lightColors;

export const theme = {
  colors: Colors,
  primary: Colors.blue,
  primaryDark: Colors.blueDark,
  accent: Colors.gold,
  accentDark: Colors.goldDark,
} as const;
