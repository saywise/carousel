import { readConfig } from '../server/config';
import { createStore } from '../server/store';
import { createGenerationService } from '../server/generation/service';
const config = readConfig({ ...process.env, NODE_ENV: 'development', GENERATION_MODE: 'codex', HOST: '127.0.0.1' });
const store = createStore(':memory:');
try {
  const result = await createGenerationService(config, store).generateCaption({ topic: 'Ask one more thoughtful question', audience: 'Curious professionals', tone: 'Clear', instructions: 'Write one short sentence and two hashtags.' });
  console.log(JSON.stringify({ mode: result.meta.mode, model: result.meta.model, validated: true, usage: result.meta.usage, caption: result.data.caption }, null, 2));
} finally { store.close(); }
