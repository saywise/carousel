import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { Slide } from '../src/Slide';
import { readConfig } from '../server/config';
import { createStore } from '../server/store';
import { createGenerationService } from '../server/generation/service';
import { jobSections, jobCarouselSchema, outputSchemaFor, inputSchema } from '../shared/content';
import { demoOutput } from '../server/generation/demo';
import { companyMedia } from '../shared/company';
import { promptFor } from '../server/generation/prompts';
const input = inputSchema.parse({ plan: { type: 'job', company: 'Brex', jobTitle: 'Staff Product Manager, AI', jobUrl: 'https://saywise.com/j/d0e2ade659aa', role: 'Product Manager' } });

test('job schema enforces all five sections and the correct responsibility/skill counts', () => {
  const schema = z.toJSONSchema(jobCarouselSchema) as any;
  assert.deepEqual(schema.properties.slides.required, [...jobSections]);
  const draft = jobCarouselSchema.parse(demoOutput('generateCarousel', input));
  for (const section of jobSections) {
    const expected = ['work', 'skills'].includes(section) ? 3 : 0;
    assert.equal(schema.properties.slides.properties[section].properties.points.minItems, expected);
    const invalid = structuredClone(draft);
    invalid.slides[section].points = expected ? [] : [{ title: 'Extra point', detail: 'Unexpected' }];
    assert.equal(jobCarouselSchema.safeParse(invalid).success, false);
  }
  const missing = structuredClone(draft) as any;
  delete missing.slides.shift;
  assert.equal(jobCarouselSchema.safeParse(missing).success, false);
});

test('job story preserves broad role, exact closing CTA, editable layers and branding through rewrites and storage', async () => {
  const store = createStore(':memory:');
  try {
    const service = createGenerationService(readConfig({}), store);
    const { data } = await service.generateCarousel(input);
    assert.deepEqual(data.slides.map(s => s.jobSection), jobSections);
    const plan = data.context!.plan;
    assert.equal(plan.type, 'job');
    if (plan.type !== 'job') throw Error('Expected job plan');
    assert.equal(plan.role, 'Product Manager');
    assert.equal(data.slides[4].companyLogo?.src, companyMedia.brex.logo.src);
    for (const [index, slide] of data.slides.entries()) {
      const html = renderToStaticMarkup(createElement(Slide, { slide, index, total: 5, jobPlan: plan }));
      assert.match(html, /Job Explainer · Product Manager/);
      assert.doesNotMatch(html, /Ideas worth sharing|<footer|01 \/ 05/);
      assert.equal(html.includes('class="slide-logo"'), index === 4);
      assert.equal(html.includes('Staff Product Manager, AI'), index === 4);
      assert.equal(!!slide.cta, index === 4);
      if (index === 1 || index === 3) assert.equal((html.match(/class="job-point"/g) ?? []).length, 3);
    }
    const visual = { src: '/brand/saywise/sage/png/sage-upper-body.png', label: 'Sage', provenance: 'brand' as const };
    for (const index of [1, 4]) {
      const slide = { ...data.slides[index], image: visual, reference: visual, imagePrompt: 'Look upward', revisionPrompt: 'More concise' };
      const revised = await service.rewriteSlide({ ...input, slide });
      assert.deepEqual(revised.data, slide);
      assert.equal(outputSchemaFor('rewriteSlide', { ...input, slide }).safeParse({ ...slide, points: index === 1 ? [] : [{ title: 'Unexpected', detail: '' }] }).success, false);
    }
    const project = { id: crypto.randomUUID(), content: data, updatedAt: new Date().toISOString() };
    store.saveProject(project);
    assert.deepEqual(store.listProjects()[0].content, JSON.parse(JSON.stringify(data)));
    assert.equal((await service.generateStaticPost(input)).data.slides.length, 1);
    assert.match(promptFor('generateCarousel', input), /EXACTLY FIVE/);
    assert.match(promptFor('generateCarousel', input), /Omit missing details/);
  } finally { store.close(); }
});
