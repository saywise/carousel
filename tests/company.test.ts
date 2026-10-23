import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { Slide } from '../src/Slide';
import { readConfig } from '../server/config';
import { createStore } from '../server/store';
import { createGenerationService } from '../server/generation/service';
import { companySections, carouselSchema, companyCarouselSchema } from '../shared/content';
import { PNG } from 'pngjs';
import { assertTransparentPng, validateCompanyLogo } from '../server/company-logo';
import { companyMedia } from '../shared/company';

test('logo validation checks PNG pixels, including existing official logos and opaque impostors', async () => {
  const png = new PNG({ width: 10, height: 10 });
  png.data.fill(0);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) png.data[(y * 10 + x) * 4 + 3] = 255;
  assert.doesNotThrow(() => assertTransparentPng(PNG.sync.write(png)));
  const store = createStore(':memory:');
  try {
    await validateCompanyLogo(companyMedia.brex.logo, store);
    await validateCompanyLogo(companyMedia.brex.logoWhite, store);
    const transparent = store.saveAsset({ dataUrl: `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`, label: 'Logo', provenance: 'uploaded' });
    await validateCompanyLogo(transparent, store);
    png.data.fill(255);
    const opaque = store.saveAsset({ dataUrl: `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`, label: 'Not transparent', provenance: 'uploaded' });
    await assert.rejects(validateCompanyLogo(opaque, store), { code: 'LOGO_TRANSPARENCY' });
    assert.throws(() => assertTransparentPng(Buffer.from('not a PNG')), { code: 'LOGO_TRANSPARENCY' });
    png.data.fill(0);
    assert.throws(() => assertTransparentPng(PNG.sync.write(png)), { code: 'LOGO_TRANSPARENCY' });
  } finally { store.close(); }
});

test('company output schema requires all five sections and exactly three product/growth points', () => {
  const schema = z.toJSONSchema(companyCarouselSchema) as any;
  assert.deepEqual(schema.properties.slides.required, [...companySections]);
  for (const section of ['product', 'growth']) {
    const variant = schema.properties.slides.properties[section];
    assert.equal(variant.properties.points.minItems, 3);
    assert.equal(variant.properties.points.maxItems, 3);
  }
});

test('company carousel preserves five editable sections, sourced media and closing-only branding through storage and rewrites', async () => {
  const store = createStore(':memory:');
  const service = createGenerationService(readConfig({}), store);
  const input = { topic: 'Brex', audience: 'Professionals', tone: 'Clear', instructions: '', plan: { type: 'company' as const, company: 'Brex', jobTitle: 'Staff Product Manager, AI', jobUrl: 'https://saywise.com/j/d0e2ade659aa' } };
  try {
    const { data } = await service.generateCarousel(input);
    assert.deepEqual(data.slides.map(slide => slide.companySection), companySections);
    assert.equal(data.slides[1].points?.length, 3);
    assert.equal(data.slides[3].points?.length, 3);
    assert.equal(data.slides[2].imageBlur, 8);
    assert.equal(data.slides[0].coverImage?.src, companyMedia.brex.product.src);
    for (const [index, slide] of data.slides.entries()) {
      const html = renderToStaticMarkup(createElement(Slide, { slide, index, total: 5, company: 'Brex' }));
      assert.match(html, /Company Spotlight · Brex/);
      assert.doesNotMatch(html, /Ideas worth sharing|A closer look|01 \/ 05|<footer/);
      assert.equal(html.includes('class="slide-logo"'), index === 4);
      assert.equal(html.includes('company-job-link'), index === 4);
      if (index < 3) {
        assert.equal(slide.image?.provenance, 'company');
        assert.ok(slide.image?.sourceUrl);
        assert.ok(html.includes(slide.image!.src));
      }
    }
    const rewritten = await service.rewriteSlide({ ...input, slide: data.slides[1], instructions: 'Keep three strengths.' });
    const revised = carouselSchema.parse({ ...data, slides: [rewritten.data] }).slides[0];
    assert.deepEqual(revised.points, data.slides[1].points);
    assert.deepEqual(revised.image, data.slides[1].image);
    assert.equal(revised.companySection, 'product');
    assert.equal(revised.footer, '');
    assert.equal(data.slides[4].cta?.jobTitle, input.plan.jobTitle);
    const project = { id: crypto.randomUUID(), updatedAt: new Date().toISOString(), content: data };
    store.saveProject(project);
    assert.deepEqual(store.listProjects()[0].content, JSON.parse(JSON.stringify(data)));
  } finally { store.close(); }
});

test('companies without bundled photography keep empty, replaceable image slots', async () => {
  const store = createStore(':memory:');
  try {
    const { data } = await createGenerationService(readConfig({}), store).generateCarousel({ topic: 'Example', audience: 'Professionals', tone: 'Clear', instructions: '', plan: { type: 'company', company: 'Example', jobTitle: 'Designer', jobUrl: 'https://saywise.com/j/example' } });
    assert.equal(data.slides.length, 5);
    assert.ok(data.slides.every(slide => !slide.image));
  } finally { store.close(); }
});
