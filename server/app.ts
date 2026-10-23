import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual, createHash } from 'node:crypto';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Store } from './store';
import { StudioError } from './errors';
import { assetUploadSchema, inputSchema, operationSchema, projectSchema, type GenerationService } from '../shared/content';
import { saywiseJobUrlSchema } from '../shared/jobs';
import { resolveJob } from './jobs';
import { validateCompanyLogo } from './company-logo';

const equal = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export function createApp(config: Config, store: Store, generation: GenerationService, readJob = resolveJob) {
  const app = express();
  app.disable('x-powered-by');
  const origin = new URL(config.APP_ORIGIN);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    // Reject DNS rebinding and cross-origin calls to the localhost CLI adapter.
    const allowedHosts = config.NODE_ENV === 'production' ? [origin.host] : [origin.host, `127.0.0.1:${config.PORT}`, `localhost:${config.PORT}`, `[::1]:${config.PORT}`];
    if (!allowedHosts.includes(req.headers.host ?? '')) return res.status(403).json({ error: 'Unrecognized host.', code: 'HOST_FORBIDDEN' });
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
      const requestOrigin = req.headers.origin;
      const allowedOrigins = config.NODE_ENV === 'production' ? [origin.origin] : allowedHosts.map(host => `http://${host}`);
      if (requestOrigin && !allowedOrigins.includes(requestOrigin)) return res.status(403).json({ error: 'Cross-origin API requests are not allowed.', code: 'ORIGIN_FORBIDDEN' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request rejected.' });
      if (['POST','PUT','PATCH'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    }
    next();
  });
  if (config.NODE_ENV === 'production') {
    // Production runs behind exactly one HTTPS reverse proxy; trust its X-Forwarded-For so rate limits are per client, not shared.
    app.set('trust proxy', 1);
    app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
    app.use((req, res, next) => {
      const raw = req.headers.authorization?.startsWith('Basic ') ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString() : '';
      const split = raw.indexOf(':');
      if (!equal(raw.slice(0, split), config.STUDIO_USER) || !equal(raw.slice(split + 1), config.STUDIO_PASSWORD!)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Saywise Studio", charset="UTF-8"');
        return res.status(401).send('Studio authentication required.');
      }
      next();
    });
  }
  app.use(express.json({ limit: '16mb' }));
  app.get('/api/status', (_req, res) => res.json({ mode: config.GENERATION_MODE, researchEnabled: config.GENERATION_MODE !== 'demo' && config.ENABLE_WEB_RESEARCH === 'true', imageMode: config.GENERATION_MODE === 'openai' ? 'openai' : 'demo' }));
  app.post('/api/jobs/resolve', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many listing lookups. Wait a minute and retry.' } }), async (req, res) => {
    res.json(await readJob(saywiseJobUrlSchema.parse(req.body.jobUrl)));
  });
  app.get('/api/assets', (_req, res) => res.json(store.listAssets()));
  app.post('/api/assets', (req, res) => res.json(store.saveAsset(assetUploadSchema.parse(req.body))));
  app.post('/api/assets/validate-logo', async (req, res) => res.json(await validateCompanyLogo(req.body.image, store, config.NODE_ENV === 'production')));
  app.get('/api/assets/:id/image', (req, res) => {
    const data = store.getAsset(req.params.id);
    if (!data) return void res.status(404).json({ error: 'Image not found.' });
    res.type(data.slice(5, data.indexOf(';'))).send(Buffer.from(data.split(',')[1], 'base64'));
  });
  app.get('/api/projects', (_req, res) => res.json(store.listProjects()));
  app.put('/api/projects/:id', async (req, res) => {
    const project = projectSchema.parse({ ...req.body, id: req.params.id, updatedAt: new Date().toISOString() });
    if (project.content.context?.plan.type === 'company') for (const [index, slide] of project.content.slides.entries()) {
      if ((slide.companySection === 'overview' || (!slide.companySection && index === 0 && project.content.slides.length > 1)) && slide.image) await validateCompanyLogo(slide.image, store, config.NODE_ENV === 'production');
    }
    for (const slide of project.content.slides) if (slide.companyLogo) await validateCompanyLogo(slide.companyLogo, store, config.NODE_ENV === 'production');
    store.saveProject(project); res.json(project);
  });
  app.get('/api/usage', (_req, res) => res.json(store.listUsage()));
  let active = 0;
  app.post('/api/generate/:operation', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { code: 'RATE_LIMIT', error: 'Too many generation requests. Wait a minute and retry.' } }), async (req, res) => {
    const operation = operationSchema.parse(req.params.operation), input = inputSchema.parse(req.body);
    if (active >= 2) throw new StudioError('BUSY', 'Two generations are already running. Please wait.', 429);
    active++;
    try { res.json(await generation[operation](input)); } finally { active--; }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) return void res.status(400).json({ code: 'INVALID_INPUT', error: 'Check the input fields and length limits.', fields: error.issues.map(issue => issue.path.join('.')) });
    if (error instanceof StudioError) return void res.status(error.status).json({ code: error.code, error: error.message });
    if (error.type === 'entity.too.large') return void res.status(413).json({ error: 'Request exceeds the 16 MB limit.' });
    if (error.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Invalid JSON.' });
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ code: 'INTERNAL_ERROR', error: 'The request could not be completed.' });
  };
  app.use(errors);
  return app;
}
