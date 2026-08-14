// brook.ie design tokens — Editorial Mobile LIGHT
// Warm ivory base, espresso text, soft lavender + pink pops. No green accents.

export const colors = {
  surface: "#FDFBF7",
  onSurface: "#2C2421",
  surfaceSecondary: "#F5F2EA",
  onSurfaceSecondary: "#3A312E",
  surfaceTertiary: "#EAE4D9",
  onSurfaceTertiary: "#4A403C",
  surfaceInverse: "#2C2421",
  onSurfaceInverse: "#FDFBF7",

  // Lavender brand + pink secondary
  brand: "#C9B6DE",
  brandDeep: "#A98FC9",
  onBrand: "#2C2421",
  pink: "#FFC8DD",
  pinkDeep: "#F4A7C6",
  onPink: "#2C2421",
  brandTertiary: "#EADDF5",

  muted: "#8A7E77",
  faint: "#B7ADA5",

  success: "#8FB08A",
  warning: "#E8C881",
  error: "#D18888",
  info: "#CDB4DB",

  border: "#EDE7DC",
  borderStrong: "#D8C9E5",
  divider: "#EDE7DC",

  white: "#FFFFFF",
  black: "#1A1512",
  scrim: "rgba(28,20,16,0.55)",
  overlay: "rgba(28,20,16,0.35)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const font = {
  display: "Cormorant-Bold",
  displaySemi: "Cormorant-SemiBold",
  regular: "Manrope-Regular",
  medium: "Manrope-Medium",
  semibold: "Manrope-SemiBold",
  bold: "Manrope-Bold",
};

export const type = {
  hero: { fontFamily: font.display, fontSize: 40, lineHeight: 44, color: colors.onSurface },
  h1: { fontFamily: font.display, fontSize: 32, lineHeight: 36, color: colors.onSurface },
  h2: { fontFamily: font.displaySemi, fontSize: 26, lineHeight: 30, color: colors.onSurface },
  title: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, color: colors.onSurface },
  subtitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: colors.onSurface },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: colors.onSurfaceSecondary },
  bodyMd: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: colors.onSurface },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  smallMd: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: colors.onSurface },
  label: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: colors.muted, letterSpacing: 0.6 },
};

export const shadow = {
  soft: {
    shadowColor: "#2C2421",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  card: {
    shadowColor: "#2C2421",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};
