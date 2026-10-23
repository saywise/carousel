import { StudioError } from '../errors';
export async function codexGenerate(..._args: unknown[]): Promise<never> {
  throw new StudioError('CLI_FORBIDDEN', 'The Codex adapter is not included in production.', 403);
}
