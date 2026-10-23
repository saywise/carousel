import type { Usage } from '../../shared/content';
export interface AdapterResult { data: unknown; model: string; usage: Usage; notice: string }
export const unknownUsage = (): Usage => ({ inputTokens: null, cachedInputTokens: null, outputTokens: null, images: 0, webSearches: 0, estimatedCostUsd: null });
