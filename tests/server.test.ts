import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { createStore } from '../server/store';
import { createGenerationService } from '../server/generation/service';
import { demoCarousel } from '../shared/demo';
import { createJobResolver } from '../server/jobs';

test('HTTP demo generation, save/read, input validation, and localhost boundaries', async () => {
  const config = readConfig({});
  const store = createStore(':memory:');
  const readJob = createJobResolver(async () => new Response('<title>Staff Product Manager, AI · Brex | Saywise</title><h1>Staff Product Manager, AI</h1>', { headers: { 'content-type': 'text/html' } }));
  const server = createApp(config, store, createGenerationService(config, store, undefined, readJob), readJob).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  config.PORT = address.port;
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Host: '127.0.0.1:3000', 'Content-Type': 'application/json' };
  try {
    const generated = await fetch(`${base}/api/generate/generateCarousel`, { method: 'POST', headers, body: JSON.stringify({ topic: 'Listening' }) });
    assert.equal(generated.status, 200); assert.equal((await generated.json()).meta.mode, 'demo');
    const jobUrl = 'https://saywise.com/j/d0e2ade659aa';
    const lookup = await fetch(`${base}/api/jobs/resolve`, { method: 'POST', headers, body: JSON.stringify({ jobUrl }) });
    assert.equal(lookup.status, 200); assert.equal((await lookup.json()).role, 'Product Manager');
    const fromUrl = await fetch(`${base}/api/generate/generateStaticPost`, { method: 'POST', headers, body: JSON.stringify({ jobRequest: { type: 'job', jobUrl } }) });
    assert.equal(fromUrl.status, 200); assert.equal((await fromUrl.json()).data.slides[0].cta.jobTitle, 'Staff Product Manager, AI');
    assert.equal((await fetch(`${base}/api/jobs/resolve`, { method: 'POST', headers, body: JSON.stringify({ jobUrl: 'http://localhost/private' }) })).status, 400);
    const id = randomUUID();
    assert.equal((await fetch(`${base}/api/projects/${id}`, { method: 'PUT', headers, body: JSON.stringify({ content: demoCarousel }) })).status, 200);
    const projects = await (await fetch(`${base}/api/projects`, { headers })).json();
    assert.equal(projects[0].id, id);
    const uploaded = await fetch(`${base}/api/assets`, { method: 'POST', headers, body: JSON.stringify({ dataUrl: 'data:image/png;base64,aW1hZ2U=', label: 'Test image', provenance: 'uploaded' }) });
    assert.equal(uploaded.status, 200);
    const asset = await uploaded.json();
    assert.match(asset.src, /^\/api\/assets\/[a-f0-9-]+\/image$/);
    const invalidLogoDraft = structuredClone(demoCarousel);
    invalidLogoDraft.slides[0].companyLogo = asset;
    const invalidLogoSave = await fetch(`${base}/api/projects/${randomUUID()}`, { method: 'PUT', headers, body: JSON.stringify({ content: invalidLogoDraft }) });
    assert.equal(invalidLogoSave.status, 400);
    assert.equal((await invalidLogoSave.json()).code, 'LOGO_TRANSPARENCY');
    assert.equal((await (await fetch(`${base}/api/assets`, { headers })).json()).length, 1);
    const imageResponse = await fetch(`${base}${asset.src}`, { headers });
    assert.match(imageResponse.headers.get('content-type')!, /image\/png/);
    assert.equal(await imageResponse.text(), 'image');
    assert.equal((await fetch(`${base}/api/generate/generateCaption`, { method: 'POST', headers, body: '{"topic":""}' })).status, 400);
    const badHostStatus = await new Promise(resolve => get(`${base}/api/status`, { headers: { Host: 'attacker.test' } }, response => { response.resume(); resolve(response.statusCode); }));
    assert.equal(badHostStatus, 403);
    assert.equal((await fetch(`${base}/api/generate/generateCaption`, { method: 'POST', headers: { ...headers, Origin: 'https://attacker.test' }, body: '{"topic":"hi"}' })).status, 403);
    assert.equal((await fetch(`${base}/api/generate/generateCaption`, { method: 'POST', headers: { Host: headers.Host, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    const status = await (await fetch(`${base}/api/status`, { headers })).text();
    assert.ok(!status.includes('OPENAI_API_KEY'));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
test('projects and usage persist across database reopening independently of generation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'saywise-store-test-'));
  try {
    const id = randomUUID(); let store = createStore(directory);
    const asset = store.saveAsset({ dataUrl: 'data:image/png;base64,aW1hZ2U=', label: 'Test image', provenance: 'uploaded' });
    const document = structuredClone(demoCarousel);
    document.slides[0].image = asset; document.slides[0].reference = asset; document.slides[0].imagePrompt = 'Make it brighter';
    store.saveProject({ id, content: document, updatedAt: new Date().toISOString() }); store.close();
    store = createStore(directory); assert.equal(store.listProjects()[0].id, id);
    assert.equal(store.listAssets()[0].src, asset.src);
    assert.equal(store.listProjects()[0].content.slides[0].imagePrompt, 'Make it brighter');
    assert.equal(store.listProjects()[0].content.slides[0].image?.src, asset.src);
    assert.equal(store.listProjects()[0].content.slides[1].image, undefined);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('production API requires authentication and enforces its configured host', async () => {
  const config = readConfig({ NODE_ENV: 'production', GENERATION_MODE: 'demo', APP_ORIGIN: 'https://studio.example', STUDIO_PASSWORD: 'test-password-not-a-real-secret' });
  const store = createStore(':memory:');
  const server = createApp(config, store, createGenerationService(config, store)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const request = (headers: Record<string, string>) => new Promise<number | undefined>(resolve => get(`http://127.0.0.1:${port}/api/status`, { headers }, response => { response.resume(); resolve(response.statusCode); }));
  try {
    assert.equal(await request({ Host: 'studio.example' }), 401);
    assert.equal(await request({ Host: 'studio.example', Authorization: `Basic ${Buffer.from('studio:test-password-not-a-real-secret').toString('base64')}` }), 200);
    assert.equal(await request({ Host: 'untrusted.example' }), 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
