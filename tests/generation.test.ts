import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { readConfig } from '../server/config';
import { createStore } from '../server/store';
import { createGenerationService } from '../server/generation/service';
import { schemas, inputSchema, carouselSchema, type Operation } from '../shared/content';
import { demoCarousel } from '../shared/demo';
import { estimateCost } from '../server/generation/openai';
import { SYSTEM_PROMPT, promptFor } from '../server/generation/prompts';
import { demoOutput } from '../server/generation/demo';

function jsonResponse(data: unknown, init?: ResponseInit) { return new Response(JSON.stringify(data), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); }
const input = { topic: 'Better questions', audience: 'Professionals', tone: 'Clear', instructions: '', slide: demoCarousel.slides[0] };
const apiConfig = () => readConfig({ GENERATION_MODE: 'openai', OPENAI_API_KEY: 'test-only', OPENAI_INPUT_USD_PER_MILLION: '2', OPENAI_CACHED_INPUT_USD_PER_MILLION: '1', OPENAI_OUTPUT_USD_PER_MILLION: '8' });
function response(data: unknown, overrides = {}) {
  return { id: 'resp_test', object: 'response', status: 'completed', model: 'test-model', output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(data), annotations: [] }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20 }, output_tokens: 30, total_tokens: 130 }, ...overrides };
}
function clientWith(fetch: typeof globalThis.fetch, retries = 0) { return new OpenAI({ apiKey: 'test-only', fetch, maxRetries: retries }); }

test('all saved fixtures satisfy the shared production contracts', async () => {
  const store = createStore(':memory:');
  try {
    const service = createGenerationService(readConfig({}), store);
    for (const operation of Object.keys(schemas) as Operation[]) {
      const result = await service[operation](input);
      assert.ok(schemas[operation].safeParse(result.data).success);
      assert.equal(result.meta.mode, 'demo');
      assert.match(result.meta.notice, /Saved demonstration/);
    }
    assert.equal(store.listUsage().length, 7);
  } finally { store.close(); }
});
test('Codex cannot be selected in production or bound to a public interface', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production', GENERATION_MODE: 'codex' }), /loopback/);
  assert.throws(() => readConfig({ GENERATION_MODE: 'codex', HOST: '0.0.0.0' }), /loopback/);
  assert.throws(() => readConfig({ GENERATION_MODE: 'openai' }), /OPENAI_API_KEY/);
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /STUDIO_PASSWORD/);
});
test('Responses API receives shared prompts and strict schema; token cost is recorded', async () => {
  let body: any;
  const client = clientWith(async (_url, init) => { body = JSON.parse(String(init?.body)); return jsonResponse(response({ caption: 'Listen first.', hashtags: ['#Curiosity'] })); });
  const store = createStore(':memory:');
  try {
    const result = await createGenerationService(apiConfig(), store, client).generateCaption(input);
    assert.equal(body.input[0].content, SYSTEM_PROMPT);
    assert.equal(body.input[1].content, promptFor('generateCaption', input));
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.store, false);
    assert.equal(result.data.caption, 'Listen first.');
    assert.ok(Math.abs(result.meta.usage.estimatedCostUsd! - 0.00042) < 1e-10);
    assert.equal(store.listUsage()[0].inputTokens, 100);
  } finally { store.close(); }
});
test('schema failures, refusals, and incomplete generations preserve known usage', async () => {
  for (const [payload, expected] of [
    [response({ wrong: true }), 'INVALID_OUTPUT'],
    [response(null, { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }), 'REFUSED'],
    [response({}, { status: 'incomplete' }), 'INCOMPLETE'],
  ] as const) {
    const store = createStore(':memory:');
    try {
      const client = clientWith(async () => jsonResponse(payload));
      await assert.rejects(createGenerationService(apiConfig(), store, client).generateCaption(input), { code: expected });
      assert.equal(store.listUsage()[0].status, 'failed');
      assert.equal(store.listUsage()[0].inputTokens, 100);
    } finally { store.close(); }
  }
});
test('official SDK retries 429 and reports exhausted rate limits without raw errors', async () => {
  let attempts = 0;
  const client = clientWith(async () => { attempts++; if (attempts === 1) return jsonResponse({ error: { message: 'rate limit' } }, { status: 429, headers: { 'retry-after-ms': '1' } }); return jsonResponse(response({ caption: 'Done', hashtags: [] })); }, 1);
  const store = createStore(':memory:');
  try {
    await createGenerationService(apiConfig(), store, client).generateCaption(input);
    assert.equal(attempts, 2);
    const failing = clientWith(async () => jsonResponse({ error: { message: 'SECRET RAW ERROR' } }, { status: 429 }));
    await assert.rejects(createGenerationService(apiConfig(), store, failing).generateCaption(input), (error: any) => error.code === 'RATE_LIMIT' && !error.message.includes('SECRET'));
  } finally { store.close(); }
});
test('API deadline cancels a stalled request', async () => {
  const config = readConfig({ GENERATION_MODE: 'openai', OPENAI_API_KEY: 'test', GENERATION_TIMEOUT_MS: '100', OPENAI_MAX_RETRIES: '0' });
  const client = clientWith(async (_url, init) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test did not abort')), 1000);
    init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
  }));
  const store = createStore(':memory:');
  try { await assert.rejects(createGenerationService(config, store, client).generateCaption(input)); assert.equal(store.listUsage()[0].status, 'failed'); } finally { store.close(); }
});
test('topic citations must originate in API search results', async () => {
  const config = { ...apiConfig(), ENABLE_WEB_RESEARCH: 'true' as const };
  const payload = response({ topics: [{ title: 'Idea', angle: 'Angle', evidence: 'source-backed', sources: [{ title: 'Real', url: 'https://example.com/real' }, { title: 'Invented', url: 'https://example.com/invented' }] }] });
  payload.output.push({ type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: 'https://example.com/real' }] } } as any);
  const store = createStore(':memory:');
  try {
    const result = await createGenerationService(config, store, clientWith(async () => jsonResponse(payload))).recommendTrendingTopics(input);
    assert.deepEqual(result.data.topics[0].sources.map(s => s.url), ['https://example.com/real']);
    assert.equal(result.meta.usage.webSearches, 1);
    assert.equal(result.meta.usage.estimatedCostUsd, null);
  } finally { store.close(); }
});
test('Image API supports generation and uploaded-image edits through official SDK', async () => {
  const paths: string[] = [];
  const imageCounts: number[] = [];
  const client = clientWith(async (url, init) => { paths.push(String(url)); if (init?.body instanceof FormData) imageCounts.push([...init.body.keys()].filter(key => key.startsWith('image')).length); return jsonResponse({ data: [{ b64_json: 'aW1hZ2U=' }], usage: { input_tokens: 20, output_tokens: 100 } }); });
  const store = createStore(':memory:');
  try {
    const service = createGenerationService({ ...apiConfig(), OPENAI_IMAGE_USD_EACH: 0.04 }, store, client);
    const generated = await service.generateIllustration(input);
    const edited = await service.generateIllustration({ ...input, imageDataUrl: 'data:image/png;base64,aW1hZ2U=' });
    await service.generateIllustration({ ...input, imageDataUrl: 'data:image/png;base64,aW1hZ2U=', referenceDataUrl: 'data:image/png;base64,aW1hZ2U=' });
    assert.deepEqual(imageCounts, [1, 2]);
    assert.equal(generated.data.provenance, 'generated');
    assert.equal(edited.data.provenance, 'edited');
    assert.ok(paths.some(path => path.endsWith('/images/generations')));
    assert.ok(paths.some(path => path.endsWith('/images/edits')));
    assert.equal(generated.meta.usage.images, 1);
    assert.equal(generated.meta.usage.estimatedCostUsd, 0.04);
  } finally { store.close(); }
});
test('missing prices remain unknown rather than zero', () => {
  assert.equal(estimateCost(readConfig({}), { inputTokens: 5, cachedInputTokens: 0, outputTokens: 3, images: 0, webSearches: 0, estimatedCostUsd: null }, false), null);
});

test('company and job workflows require explicit job details and live research outside demo mode', async () => {
  assert.equal(inputSchema.safeParse({ ...input, plan: { type: 'company', company: 'Acme' } }).success, false);
  assert.equal(inputSchema.safeParse({ ...input, plan: { type: 'job', jobTitle: 'Designer', jobUrl: 'javascript:alert(1)' } }).success, false);
  const store = createStore(':memory:');
  const plan = { type: 'job' as const, jobTitle: 'Designer', jobUrl: 'https://example.com/job' };
  try {
    await assert.rejects(createGenerationService(apiConfig(), store).generateStaticPost({ ...input, plan }), { code: 'RESEARCH_DISABLED' });
    for (const operation of ['generateStaticPost', 'generateCarousel'] as const) {
      const result = await createGenerationService(readConfig({}), store)[operation]({ ...input, plan });
      assert.equal(result.data.context?.plan.type, 'job');
      assert.equal(result.data.slides.at(-1)?.cta?.url, plan.jobUrl);
      assert.ok(result.data.caption.includes(plan.jobUrl));
      assert.equal(result.data.research?.sources.length, 0);
      assert.match(result.data.research!.summary, /demonstration/i);
      assert.equal(result.data.slides.length, operation === 'generateStaticPost' ? 1 : 5);
    }
  } finally { store.close(); }
});

test('researched drafts force web search, reject invented citations, and retain exact CTA and context', async () => {
  const store = createStore(':memory:');
  const plan = { type: 'company' as const, company: 'Acme', jobTitle: 'Designer', jobUrl: 'https://example.com/job?a=1' };
  const source = { title: 'Company', url: 'https://example.com/about', supports: 'What the company does.' };
  const draft = { ...demoOutput('generateCarousel', { ...input, plan }) as typeof demoCarousel, research: { summary: 'Company facts and editorial angle.', sources: [source] } };
  const payload = response(draft);
  payload.output.push({ type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: source.url }] } } as any);
  let body: any;
  try {
    const config = { ...apiConfig(), ENABLE_WEB_RESEARCH: 'true' as const };
    const service = createGenerationService(config, store, clientWith(async (_url, init) => { body = JSON.parse(String(init?.body)); return jsonResponse(payload); }));
    const result = await service.generateCarousel({ ...input, plan });
    assert.equal(body.tool_choice, 'required');
    assert.match(body.input[1].content, /COMPANY SPOTLIGHT/);
    assert.equal(result.data.slides.at(-1)?.cta?.url, plan.jobUrl);
    assert.deepEqual(result.data.context?.plan, { ...plan, role: 'Designer' });
    assert.equal(carouselSchema.parse(result.data).research?.sources[0].url, source.url);
    const invented = { ...draft, research: { ...draft.research, sources: [{ ...source, url: 'https://invented.example' }] } };
    const bad = response(invented); bad.output.push(payload.output[1]);
    await assert.rejects(createGenerationService(config, store, clientWith(async () => jsonResponse(bad))).generateCarousel({ ...input, plan }), { code: 'RESEARCH_UNVERIFIED' });
  } finally { store.close(); }
});

test('slide rewrites preserve image layers, reference, prompts and closing link', async () => {
  const store = createStore(':memory:');
  const image = { src: '/brand/saywise/sage/png/sage-upper-body.png', label: 'Sage', provenance: 'brand' as const };
  const slide = { ...demoCarousel.slides[0], image, reference: image, imagePrompt: 'Wave hello', revisionPrompt: 'Shorter', cta: { jobTitle: 'Designer', url: 'https://example.com/job' } };
  try {
    const result = await createGenerationService(readConfig({}), store).rewriteSlide({ ...input, slide });
    assert.deepEqual((result.data as typeof slide).image, image);
    assert.deepEqual((result.data as typeof slide).cta, slide.cta);
    assert.equal((result.data as typeof slide).imagePrompt, 'Wave hello');
  } finally { store.close(); }
});


test('OpenAI Job Explainer uses the five-section contract and returns the same editable slide array', async () => {
  const store = createStore(':memory:');
  const plan = { type: 'job' as const, company: 'Example', jobTitle: 'Staff Product Manager, AI', role: 'Product Manager', jobUrl: 'https://saywise.com/j/example' };
  const source = { title: 'Role research', url: 'https://example.com/roles', supports: 'Role responsibilities, a current shift and skills.' };
  const wire = demoOutput('generateCarousel', { ...input, plan }) as Record<string, unknown>;
  const payload = response({ ...wire, research: { summary: 'Verified role research.', sources: [source] } });
  payload.output.push({ type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: source.url }] } } as any);
  let request: any;
  try {
    const client = clientWith(async (_url, init) => { request = JSON.parse(String(init?.body)); return jsonResponse(payload); });
    const result = await createGenerationService({ ...apiConfig(), ENABLE_WEB_RESEARCH: 'true' }, store, client).generateCarousel({ ...input, plan });
    assert.deepEqual(request.text.format.schema.properties.slides.required, ['hook', 'work', 'shift', 'skills', 'opportunity']);
    assert.equal(request.tool_choice, 'required');
    assert.equal(result.data.slides.length, 5);
    assert.equal(result.data.slides[1].points?.length, 3);
    assert.equal(result.data.slides[3].points?.length, 3);
    assert.deepEqual(result.data.slides[4].cta, { jobTitle: plan.jobTitle, url: plan.jobUrl });
    assert.deepEqual(result.data.research?.sources, [source]);
  } finally { store.close(); }
});
