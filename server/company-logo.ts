import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { libraryImageSchema, type LibraryImage } from '../shared/content';
import type { Store } from './store';
import { StudioError } from './errors';

export function assertTransparentPng(bytes: Buffer) {
  const fail = () => { throw new StudioError('LOGO_TRANSPARENCY', 'Company logos must be PNGs with a transparent background. Choose an official transparent PNG; JPGs, opaque PNGs and baked-in checkerboards cannot be used as logos.', 400); };
  if (bytes.length < 33 || bytes.length > 10_000_000 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return fail();
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width * height > 16_000_000) return fail();
  let png: PNG;
  try { png = PNG.sync.read(bytes); } catch { return fail(); }
  let clear = 0, visible = 0, clearEdge = 0, edges = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = png.data[(y * width + x) * 4 + 3];
    if (alpha === 0) clear++; else visible++;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) { edges++; if (alpha === 0) clearEdge++; }
  }
  if (!visible || clear / (width * height) < .01 || clearEdge / edges < .25) return fail();
}

export async function validateCompanyLogo(image: LibraryImage, store: Store, production = false) {
  const checked = libraryImageSchema.parse(image);
  const assetId = checked.src.match(/^\/api\/assets\/([a-f0-9-]{36})\/image$/)?.[1];
  let bytes: Buffer;
  if (assetId) {
    const data = store.getAsset(assetId);
    if (!data) throw new StudioError('IMAGE_NOT_FOUND', 'This logo is no longer in the Library.', 400);
    bytes = Buffer.from(data.split(',')[1], 'base64');
  } else {
    try { bytes = await readFile(resolve(production ? 'dist/client' : 'public', checked.src.slice(1))); }
    catch { throw new StudioError('IMAGE_NOT_FOUND', 'The selected logo could not be loaded.', 400); }
  }
  assertTransparentPng(bytes);
  return checked;
}
