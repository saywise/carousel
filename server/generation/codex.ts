// This entire module is replaced by a rejecting stub in the production build.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Config } from '../config';
import { StudioError } from '../errors';
import { schemas, outputSchemaFor, type TextOperation, type GenerationInput } from '../../shared/content';
import { SYSTEM_PROMPT, promptFor, needsResearch } from './prompts';
import { unknownUsage, type AdapterResult } from './types';

function run(binary: string, args: string[], input: string, cwd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Never pass application/API secrets to the CLI or a shell. Reuse CLI-managed login only.
    const env = Object.fromEntries(['PATH','HOME','CODEX_HOME','TMPDIR','LANG','SYSTEMROOT'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
    const child = spawn(binary, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = ''; let failed = false;
    const stop = () => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* process already exited */ } };
    const timer = setTimeout(() => { failed = true; stop(); reject(new StudioError('TIMEOUT', 'Codex timed out. Try again or use saved demo content.', 504)); }, timeout);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 2_000_000) { failed = true; stop(); reject(new StudioError('CLI_OUTPUT_LIMIT', 'Codex output exceeded the allowed size.')); } });
    child.stderr.resume(); // Do not relay local paths, logs, or authentication details to the browser.
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new StudioError('CLI_UNAVAILABLE', 'Codex CLI could not start. Check CODEX_BIN or use GENERATION_MODE=demo.', 503)); });
    child.on('close', code => { clearTimeout(timer); if (failed) return; if (code !== 0) reject(new StudioError('CLI_FAILED', 'Codex generation failed. Check codex login status in your terminal, or use saved demo content.', 503)); else resolve(output); });
    child.stdin.end(input);
  });
}
let capabilityCheck: Promise<void> | undefined;
export async function codexGenerate(config: Config, operation: TextOperation, input: GenerationInput): Promise<AdapterResult> {
  if (config.NODE_ENV !== 'development' || config.GENERATION_MODE !== 'codex' || !['127.0.0.1','localhost','::1'].includes(config.HOST))
    throw new StudioError('CLI_FORBIDDEN', 'Codex is available only in local development.', 403);
  capabilityCheck ??= run(config.CODEX_BIN, ['exec', '--help'], '', tmpdir(), 10000).then(help => {
    for (const flag of ['--output-schema', '--json', '--ephemeral', '--ignore-user-config', '--sandbox', '--output-last-message'])
      if (!help.includes(flag)) throw new StudioError('CLI_UNSUPPORTED', `Installed Codex lacks ${flag}. Use saved demo content.`, 503);
  }).catch(error => { capabilityCheck = undefined; throw error; });
  await capabilityCheck;
  const research = config.ENABLE_WEB_RESEARCH === 'true' && (needsResearch(operation, input) || operation === 'recommendTrendingTopics');
  if (research) {
    const help = await run(config.CODEX_BIN, ['--help'], '', tmpdir(), 10000);
    if (!help.includes('--search')) throw new StudioError('CLI_SEARCH_UNSUPPORTED', 'Installed Codex does not support live search. Use demonstration mode or the OpenAI API.', 503);
  }
  const directory = await mkdtemp(join(tmpdir(), 'saywise-content-'));
  try {
    const schemaPath = join(directory, 'schema.json'), outputPath = join(directory, 'output.json');
    await writeFile(schemaPath, JSON.stringify(z.toJSONSchema(outputSchemaFor(operation, input))), { mode: 0o600 });
    const args = ['exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--json', '--color', 'never', '--output-schema', schemaPath, '--output-last-message', outputPath,
      '-c', 'model_provider="openai"', '-c', 'features.shell_tool=false'];
    if (research) args.unshift('--search');
    if (config.CODEX_MODEL) args.push('--model', config.CODEX_MODEL);
    args.push('-');
    const events = await run(config.CODEX_BIN, args, `${SYSTEM_PROMPT}\n${research ? 'You must use web search for research. Only web search is allowed. Never inspect local files, run commands, or use other tools. Cite supporting public URLs and review source dates.' : 'Do not use tools, inspect files, or run commands. All context is supplied below.'}\n${promptFor(operation, input)}`, directory, config.GENERATION_TIMEOUT_MS);
    const usage = unknownUsage();
    for (const line of events.split('\n').filter(Boolean)) {
      try { const event = JSON.parse(line); if (event.type === 'item.completed' && event.item?.type === 'web_search') usage.webSearches++; if (event.type === 'turn.completed' && event.usage) { usage.inputTokens = event.usage.input_tokens ?? null; usage.cachedInputTokens = event.usage.cached_input_tokens ?? null; usage.outputTokens = event.usage.output_tokens ?? null; } } catch { /* ignore non-event output */ }
    }
    const data = JSON.parse(await readFile(outputPath, 'utf8'));
    return { data, model: config.CODEX_MODEL || 'Codex configured default', usage, notice: research && usage.webSearches ? 'Local Codex searched the web. Review the supplied citations: the CLI confirms search activity but does not expose the API’s full source verification metadata. Subscription usage is separate from API billing.' : 'Local Codex generation using your saved CLI login. Subscription usage is not an API cost estimate. No live research performed.' };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
