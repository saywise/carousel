import { readConfig } from '../server/config';
import { createStore } from '../server/store';
import { createGenerationService } from '../server/generation/service';
if (!process.env.OPENAI_API_KEY) { console.error('Set OPENAI_API_KEY in your server environment or .env. This live smoke test makes one billable Responses API request.'); process.exit(1); }
const config = readConfig({ ...process.env, GENERATION_MODE: 'openai' });
const store = createStore(':memory:');
try {
  const result = await createGenerationService(config, store).generateCaption({ topic: 'Listen with curiosity', audience: 'Professionals', tone: 'Clear', instructions: 'One short sentence and one hashtag.' });
  console.log(JSON.stringify({ validated: true, model: result.meta.model, usage: result.meta.usage }, null, 2));
} finally { store.close(); }
