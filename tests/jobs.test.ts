import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJobUrl, generalizeRole } from '../shared/jobs';
import { createJobResolver, parseJobPage } from '../server/jobs';
import { createGenerationService } from '../server/generation/service';
import { createStore } from '../server/store';
import { readConfig } from '../server/config';
import { inputSchema, carouselSchema } from '../shared/content';
import { promptFor } from '../server/generation/prompts';

const url = 'https://saywise.com/j/d0e2ade659aa';
// Public markup shape observed on the user-supplied page, without its scripts.
const html = `<html><head><meta property="og:title" content="Staff Product Manager, AI · Brex | Saywise"><meta name="description" content="You&#x27;ll work on our core AI team."></head><body><h1>Staff Product Manager, AI</h1><p>Brex</p></body></html>`;
const htmlResponse = (body = html) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

test('Saywise metadata imports exact title and company while deriving a broad role', () => {
  const listing = parseJobPage(html, url);
  assert.equal(listing.company, 'Brex');
  assert.equal(listing.jobTitle, 'Staff Product Manager, AI');
  assert.equal(listing.role, 'Product Manager');
  assert.equal(listing.summary, "You'll work on our core AI team.");
  assert.equal(listing.jobUrl, url);
  const structured = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'JobPosting', title: 'Senior Software Engineer, Payments', hiringOrganization: { name: 'Example & Co' }, description: '<p>Build products.</p>' }] })}</script>`;
  assert.equal(parseJobPage(structured, url).role, 'Software Engineer');
  assert.throws(() => parseJobPage('<title>Sign in | Saywise</title>', url), { code: 'JOB_UNREADABLE' });
  assert.throws(() => parseJobPage(html.replace('<h1>Staff Product Manager, AI', '<h1>Job not found'), url), { code: 'JOB_UNREADABLE' });
});

test('role normalization removes levels and specializations without merging distinct professions', () => {
  for (const [title, expected] of [
    ['Staff Product Manager, AI', 'Product Manager'], ['Sr. Product Manager - Growth', 'Product Manager'],
    ['Principal Software Engineer, Platform', 'Software Engineer'], ['Senior Product Designer (Mobile)', 'Product Designer'],
    ['Senior Project Manager, Construction', 'Project Manager'], ['Senior Product Marketing Manager, AI', 'Product Marketing Manager'],
    ['Staff Data Scientist II', 'Data Scientist'], ['Chief of Staff', 'Chief of Staff'], ['Lead Generation Specialist', 'Lead Generation Specialist'],
    ['Senior Landscape Architect, Urban Design', 'Landscape Architect'],
  ]) assert.equal(generalizeRole(title), expected, title);
});

test('URL reader rejects external hosts, credentials, ports and redirect escapes before fetching', async () => {
  assert.equal(canonicalJobUrl(`${url}/?utm_source=studio#details`), url);
  let calls = 0;
  const read = createJobResolver(async () => { calls++; return htmlResponse(); });
  for (const bad of ['http://saywise.com/j/d0e2ade659aa', 'https://saywise.com.evil.test/j/d0e2ade659aa', 'https://user:pass@saywise.com/j/d0e2ade659aa', 'https://saywise.com:8443/j/d0e2ade659aa', 'https://127.0.0.1/j/d0e2ade659aa', 'https://saywise.com/settings']) await assert.rejects(read(bad), { code: 'JOB_URL_INVALID' });
  assert.equal(calls, 0);
  const redirect = createJobResolver(async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); });
  await assert.rejects(redirect(url), { code: 'JOB_UNREADABLE' });
  assert.equal(calls, 1);
});

test('reader follows only a safe same-listing redirect, bounds responses and caches successes', async () => {
  const paths: string[] = [];
  const read = createJobResolver(async target => { paths.push(String(target)); return paths.length === 1 ? new Response(null, { status: 301, headers: { location: 'https://www.saywise.com/j/d0e2ade659aa' } }) : htmlResponse(); });
  const result = await read(url); result.company = 'Changed by caller';
  assert.equal((await read(url)).company, 'Brex');
  assert.equal(paths.length, 2);
  await assert.rejects(createJobResolver(async () => new Response(null, { status: 404 }))(url), { code: 'JOB_UNAVAILABLE' });
  await assert.rejects(createJobResolver(async () => htmlResponse('x'.repeat(1_500_001)))(url), { code: 'JOB_UNREADABLE' });
  await assert.rejects(createJobResolver(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))(url), { code: 'JOB_UNREADABLE' });
});

test('URL-only company and job drafts save imported context and keep the exact listing in the CTA', async () => {
  const store = createStore(':memory:');
  try {
    const service = createGenerationService(readConfig({}), store, undefined, createJobResolver(async () => htmlResponse()));
    for (const type of ['company', 'job'] as const) {
      for (const operation of ['generateCarousel', 'generateStaticPost'] as const) {
        const result = await service[operation](inputSchema.parse({ jobRequest: { type, jobUrl: url } }));
        const content = carouselSchema.parse(result.data);
        const plan = content.context!.plan;
        assert.notEqual(plan.type, 'general');
        if (plan.type === 'general') throw new Error('Unexpected general draft');
        assert.equal(plan.company, 'Brex'); assert.equal(plan.role, 'Product Manager');
        assert.equal(plan.listing?.jobTitle, 'Staff Product Manager, AI');
        assert.equal(content.slides.at(-1)?.cta?.jobTitle, 'Staff Product Manager, AI');
        assert.equal(content.slides.at(-1)?.cta?.url, url);
        assert.equal(content.slides[0].title, type === 'job' ? operation === 'generateCarousel' ? 'What does a Product Manager actually do?' : 'Product Manager' : 'Brex');
        const prompt = promptFor(operation, inputSchema.parse({ topic: content.context!.topic, plan }));
        if (type === 'job') assert.match(prompt, /explainer topic is "Product Manager"/);
        else assert.match(prompt, /COMPANY SPOTLIGHT/);
      }
    }
    const adjusted = await service.generateStaticPost(inputSchema.parse({ jobRequest: { type: 'job', jobUrl: url, roleOverride: 'Product Management' } }));
    assert.equal(adjusted.data.slides[0].title, 'Product Management');
    assert.equal(adjusted.data.slides[0].cta?.jobTitle, 'Staff Product Manager, AI');
    const unavailable = createGenerationService(readConfig({}), store, undefined, createJobResolver(async () => new Response(null, { status: 404 })));
    await assert.rejects(unavailable.generateCarousel(inputSchema.parse({ jobRequest: { type: 'company', jobUrl: url } })), { code: 'JOB_UNAVAILABLE' });
  } finally { store.close(); }
});
