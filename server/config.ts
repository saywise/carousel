import 'dotenv/config';
import { z } from 'zod';
const rate = z.preprocess(v => v === '' || v === undefined ? undefined : Number(v), z.number().finite().nonnegative().optional());
const envSchema = z.object({
  NODE_ENV: z.string().default('development'), GENERATION_MODE: z.enum(['demo', 'codex', 'openai']).default('demo'),
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:3000'), DATA_DIR: z.string().default('./data'),
  CODEX_BIN: z.string().default('codex'), CODEX_MODEL: z.string().optional(),
  GENERATION_TIMEOUT_MS: z.coerce.number().int().min(100).max(300000).default(120000),
  OPENAI_API_KEY: z.string().optional(), OPENAI_TEXT_MODEL: z.string().default('gpt-6-astra'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-2.5-flare'),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(6000),
  ENABLE_WEB_RESEARCH: z.enum(['true','false']).default('false'),
  OPENAI_INPUT_USD_PER_MILLION: rate, OPENAI_CACHED_INPUT_USD_PER_MILLION: rate,
  OPENAI_OUTPUT_USD_PER_MILLION: rate, OPENAI_IMAGE_USD_EACH: rate, OPENAI_WEB_SEARCH_USD_EACH: rate,
  STUDIO_USER: z.string().default('studio'), STUDIO_PASSWORD: z.string().optional(),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = envSchema.parse(env);
  if (config.GENERATION_MODE === 'codex' && (config.NODE_ENV !== 'development' || !['127.0.0.1', 'localhost', '::1'].includes(config.HOST)))
    throw new Error('Codex mode requires development and a loopback HOST.');
  if (config.GENERATION_MODE === 'openai' && !config.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY on the server for OpenAI mode.');
  if (config.NODE_ENV === 'production' && (!config.STUDIO_PASSWORD || config.STUDIO_PASSWORD.length < 16))
    throw new Error('Production requires STUDIO_PASSWORD of at least 16 characters.');
  return config;
}
export type Config = ReturnType<typeof readConfig>;
