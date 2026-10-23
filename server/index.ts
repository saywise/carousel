import express from 'express';
import { resolve } from 'node:path';
import { readConfig } from './config';
import { createStore } from './store';
import { createGenerationService } from './generation/service';
import { createApp } from './app';
const config = readConfig();
const store = createStore(config.DATA_DIR);
const app = createApp(config, store, createGenerationService(config, store));
if (config.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist/client')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(config.PORT, config.HOST, () => console.log(`Saywise Content Studio: http://${config.HOST}:${config.PORT} (${config.GENERATION_MODE})`));
server.requestTimeout = config.GENERATION_TIMEOUT_MS + 10000;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
