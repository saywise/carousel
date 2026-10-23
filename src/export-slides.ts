import { zipSync } from 'fflate';

export const exportSize = { width: 1080, height: 1350 } as const;

// Render sequentially to keep memory bounded and preserve carousel order.
// A failed render rejects the whole export; never download an incomplete set.
export async function renderSlideArchive<T>(slides: T[], render: (slide: T) => Promise<string>, progress: (completed: number, total: number) => void = () => {}) {
  if (!slides.length) throw new Error('There are no slides to export.');
  const files: Record<string, Uint8Array> = {};
  for (const [index, slide] of slides.entries()) {
    const image = await render(slide);
    if (!image.startsWith('data:image/png;base64,')) throw new Error(`Slide ${index + 1} could not be exported as a PNG.`);
    files[`slide-${String(index + 1).padStart(2, '0')}.png`] = Uint8Array.from(atob(image.slice(image.indexOf(',') + 1)), character => character.charCodeAt(0));
    progress(index + 1, slides.length);
  }
  // PNGs are already compressed, so store them without a second compression pass.
  return zipSync(files, { level: 0 });
}
