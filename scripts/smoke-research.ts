import assert from 'node:assert/strict';
import { readConfig } from '../server/config';
import { createStore } from '../server/store';
import { createGenerationService } from '../server/generation/service';
const store = createStore(':memory:');
try {
  const result = await createGenerationService(readConfig({ ...process.env, NODE_ENV: 'development', GENERATION_MODE: 'codex', HOST: '127.0.0.1', ENABLE_WEB_RESEARCH: 'true', GENERATION_TIMEOUT_MS: '180000' }), store).generateCarousel({
    topic: 'What makes Patagonia interesting as a company? Use concise facts and a thoughtful editorial angle. The supplied job link is a test fixture, not a real listing.',
    audience: 'Curious job seekers', tone: 'Clear', instructions: '',
    plan: { type: 'company', company: 'Patagonia', jobTitle: 'Product designer', jobUrl: 'https://example.com/saywise-test-listing' },
  });
  assert.ok(result.meta.usage.webSearches > 0);
  assert.ok(result.data.research?.sources.length);
  assert.equal(result.data.slides.at(-1)?.cta?.url, 'https://example.com/saywise-test-listing');
  console.log(JSON.stringify({ validated: true, searches: result.meta.usage.webSearches, slides: result.data.slides.length, research: result.data.research, notice: result.meta.notice }, null, 2));
} finally { store.close(); }
