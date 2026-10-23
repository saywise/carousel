// Transcribed from the supplied colors/saywise-brand-colors.png.
// Shared by rendering, the reference gallery, and generation prompts.
export const brandColors = {
  mint: '#14EEB6', blue: '#0C8BE7', dark: '#00151D', light: '#F4F8F9',
  ink: '#0A0A0A', white: '#FFFFFF', accent: '#8B4DFF', ink2: '#585858',
  jacket: '#66A977', shirt: '#E5F6EE', skin: '#E4C19D', grey: '#E9E9EB',
} as const;
export const brandBase = '/brand/saywise';
export const brandAssets = {
  logo: `${brandBase}/logo/vector/saywise-logo-color.svg`,
  logoBlack: `${brandBase}/logo/vector/saywise-logo-black.svg`,
  logoWhite: `${brandBase}/logo/vector/saywise-logo-white.svg`,
  icon: `${brandBase}/logo/vector/saywise-icon-color.svg`,
  iconBlack: `${brandBase}/logo/vector/saywise-icon-black.svg`,
  iconWhite: `${brandBase}/logo/vector/saywise-icon-white.svg`,
  palette: `${brandBase}/colors/saywise-brand-colors.png`,
  sage: `${brandBase}/sage/png/sage-upper-body.png`,
} as const;
export const brandThemes = ['mint', 'blue', 'dark', 'light', 'gradient', 'mist'] as const;
export type BrandTheme = (typeof brandThemes)[number];
export function resolveTheme(theme: BrandTheme | 'lime' | 'ink' | 'paper'): BrandTheme {
  return theme === 'lime' ? 'mint' : theme === 'ink' ? 'dark' : theme === 'paper' ? 'light' : theme;
}
export const themeLabels: Record<BrandTheme, string> = { mint: 'Mint', blue: 'Blue', dark: 'Saywise dark', light: 'Saywise light', gradient: 'Mint → blue', mist: 'Sage mist' };
export const artworkIds = ['sage', 'sage-glance', 'sage-eyes-closed', 'brand-mark', 'none'] as const;
export const artworkOptions = [
  { id: 'sage', label: 'Sage · curious', src: brandAssets.sage },
  { id: 'sage-glance', label: 'Sage · glance', src: `${brandBase}/sage/png/sage-upper-body-glance.png` },
  { id: 'sage-eyes-closed', label: 'Sage · thoughtful', src: `${brandBase}/sage/png/sage-upper-body-eyes-closed.png` },
  { id: 'brand-mark', label: 'Saywise quotation mark', src: brandAssets.icon },
  { id: 'none', label: 'No illustration', src: '' },
] as const;
export const imageReferences = [
  { id: 'sage', label: 'Sage · upper body', src: brandAssets.sage },
  { id: 'sage-full', label: 'Sage · full body', src: `${brandBase}/sage/png/sage-full-body.png` },
  { id: 'sage-glance', label: 'Sage · glance', src: `${brandBase}/sage/png/sage-upper-body-glance.png` },
  { id: 'palette', label: 'Brand palette', src: brandAssets.palette },
] as const;
export const BRAND_GUIDANCE = `Saywise brand reference: mint ${brandColors.mint}, blue ${brandColors.blue}, dark ${brandColors.dark}, light ${brandColors.light}, ink ${brandColors.ink}, white ${brandColors.white}, primary CTA purple ${brandColors.accent}. The signature gradient runs mint to blue. Sage character colors: jacket ${brandColors.jacket}, shirt ${brandColors.shirt}, skin ${brandColors.skin}, avatar grey ${brandColors.grey}. UI typeface: Geist Sans. Use the provided official logo assets; never redraw, retype, or invent a logo. Final text, logos, and layout are rendered deterministically by the app.`;
