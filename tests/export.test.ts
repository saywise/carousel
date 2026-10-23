import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';
import { renderSlideArchive } from '../src/export-slides';

test('ZIP includes every PNG exactly once in carousel order with identical image bytes', async () => {
  const slides = [11, 22, 33, 44, 55];
  const progress: number[] = [];
  const zip = await renderSlideArchive(slides, async value => {
    const png = new PNG({ width: 2, height: 2 }); png.data.fill(value);
    return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
  }, completed => progress.push(completed));
  const files = unzipSync(zip);
  assert.deepEqual(Object.keys(files), ['slide-01.png', 'slide-02.png', 'slide-03.png', 'slide-04.png', 'slide-05.png']);
  assert.deepEqual(progress, [1, 2, 3, 4, 5]);
  for (const [index, bytes] of Object.values(files).entries()) assert.equal(PNG.sync.read(Buffer.from(bytes)).data[0], slides[index]);
});

test('a failed image aborts the archive and static posts produce a single PNG', async () => {
  await assert.rejects(renderSlideArchive([], async () => ''), /no slides/);
  await assert.rejects(renderSlideArchive([1, 2], async value => value === 1 ? 'data:image/png;base64,aGk=' : 'data:,'), /Slide 2/);
  await assert.rejects(renderSlideArchive([1], async () => { throw new Error('Image failed to load'); }), /Image failed/);
  const zip = await renderSlideArchive([1], async () => 'data:image/png;base64,aGk=');
  assert.deepEqual(Object.keys(unzipSync(zip)), ['slide-01.png']);
});
