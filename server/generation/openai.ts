import OpenAI, { toFile } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Config } from '../config';
import { StudioError } from '../errors';
import { schemas, outputSchemaFor, type Operation, type GenerationInput, type Usage } from '../../shared/content';
import { SYSTEM_PROMPT, promptFor, needsResearch } from './prompts';
import { type AdapterResult, unknownUsage } from './types';

export function estimateCost(config: Config, usage: Usage, image: boolean): number | null {
  if (image) return config.OPENAI_IMAGE_USD_EACH === undefined ? null : usage.images * config.OPENAI_IMAGE_USD_EACH;
  const { OPENAI_INPUT_USD_PER_MILLION: input, OPENAI_OUTPUT_USD_PER_MILLION: output, OPENAI_CACHED_INPUT_USD_PER_MILLION: cached, OPENAI_WEB_SEARCH_USD_EACH: search } = config;
  if (input === undefined || output === undefined || usage.inputTokens === null || usage.outputTokens === null || usage.cachedInputTokens === null || (usage.cachedInputTokens > 0 && cached === undefined) || (usage.webSearches > 0 && search === undefined)) return null;
  return ((usage.inputTokens - usage.cachedInputTokens) * input + usage.cachedInputTokens * (cached ?? input) + usage.outputTokens * output) / 1_000_000 + usage.webSearches * (search ?? 0);
}
export function createOpenAIAdapter(config: Config, client = new OpenAI({ apiKey: config.OPENAI_API_KEY, maxRetries: config.OPENAI_MAX_RETRIES, timeout: config.GENERATION_TIMEOUT_MS })) {
  return async (operation: Operation, input: GenerationInput, onUsage: (result: AdapterResult) => void): Promise<AdapterResult> => {
    // This deadline bounds the complete operation, including SDK retry backoff.
    const signal = AbortSignal.timeout(config.GENERATION_TIMEOUT_MS);
    if (operation === 'generateIllustration') {
      const params = { model: config.OPENAI_IMAGE_MODEL, prompt: promptFor(operation, input), n: 1, size: '1024x1024' as const, quality: 'medium' as const, output_format: 'png' as const };
      const images = [input.imageDataUrl, input.referenceDataUrl].filter((value): value is string => !!value);
      const result = images.length
        ? await client.images.edit({ ...params, image: await Promise.all(images.map((value, index) => toFile(Buffer.from(value.split(',')[1], 'base64'), `reference-${index}.` + value.split(';')[0].split('/')[1], { type: value.split(';')[0].slice(5) }))) }, { signal })
        : await client.images.generate(params, { signal });
      const usage = unknownUsage();
      usage.images = result.data?.length ?? 0;
      usage.inputTokens = result.usage?.input_tokens ?? null;
      usage.outputTokens = result.usage?.output_tokens ?? null;
      usage.estimatedCostUsd = estimateCost(config, usage, true);
      const adapterResult: AdapterResult = { data: null, model: config.OPENAI_IMAGE_MODEL, usage, notice: 'Optional AI illustration. Use licensed company photography and official logo assets where appropriate. Image cost is an estimate using your configured per-image rate.' };
      onUsage(adapterResult);
      const encoded = result.data?.[0]?.b64_json;
      if (!encoded) throw new StudioError('IMAGE_EMPTY', 'The Image API returned no image.');
      adapterResult.data = { dataUrl: `data:image/png;base64,${encoded}`, alt: input.topic, provenance: input.imageDataUrl ? 'edited' : 'generated' };
      return adapterResult;
    }
    const research = (operation === 'recommendTrendingTopics' || needsResearch(operation, input)) && config.ENABLE_WEB_RESEARCH === 'true';
    const response = await client.responses.create({
      model: config.OPENAI_TEXT_MODEL, store: false,
      input: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: promptFor(operation, input) }],
      text: { format: zodTextFormat(outputSchemaFor(operation, input), operation) },
      max_output_tokens: config.OPENAI_MAX_OUTPUT_TOKENS,
      ...(research ? { tools: [{ type: 'web_search' as const }], tool_choice: 'required' as const, include: ['web_search_call.action.sources' as const] } : {}),
    }, { signal });
    const usage: Usage = {
      inputTokens: response.usage?.input_tokens ?? null, cachedInputTokens: response.usage?.input_tokens_details.cached_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null, images: 0,
      webSearches: response.output.filter(item => item.type === 'web_search_call').length, estimatedCostUsd: null,
    };
    usage.estimatedCostUsd = estimateCost(config, usage, false);
    const adapterResult: AdapterResult = { data: null, model: response.model, usage, notice: research ? 'Topic sources are retained when returned by web search. Review claims before publishing.' : 'AI draft. Review factual claims before publishing. No live research performed.' };
    onUsage(adapterResult); // Account for billed responses even when refused, incomplete, or invalid.
    if (response.output.some(item => item.type === 'message' && item.content.some(part => part.type === 'refusal')))
      throw new StudioError('REFUSED', 'OpenAI declined this request. Revise the topic or instructions.', 422);
    if (response.status !== 'completed') throw new StudioError('INCOMPLETE', 'Generation did not complete. Shorten the request or increase the server output limit.');
    try { adapterResult.data = JSON.parse(response.output_text); } catch { throw new StudioError('INVALID_OUTPUT', 'The model returned invalid JSON. Please try again.'); }
    if (operation === 'recommendTrendingTopics' || needsResearch(operation, input)) {
      const retrievedUrls = new Set<string>();
      // URL-first requests have already fetched this listing on the server.
      // A model may cite that supplied source as well as its web-search results.
      if (input.jobRequest && input.plan && input.plan.type !== 'general' && input.plan.listing) retrievedUrls.add(input.plan.listing.jobUrl);
      // Keep only source URLs delivered by the API, never model-invented citations.
      for (const item of response.output) {
        if (item.type === 'message') for (const part of item.content) if (part.type === 'output_text') for (const annotation of part.annotations) if (annotation.type === 'url_citation') retrievedUrls.add(annotation.url);
        if (item.type === 'web_search_call' && item.action?.type === 'search') for (const source of item.action.sources ?? []) if ('url' in source) retrievedUrls.add(source.url);
      }
      if (operation === 'recommendTrendingTopics') {
        const topics = schemas.recommendTrendingTopics.parse(adapterResult.data);
        for (const topic of topics.topics) { topic.sources = topic.sources.filter(source => retrievedUrls.has(source.url)); topic.evidence = topic.sources.length ? 'source-backed' : 'suggested'; }
        adapterResult.data = topics;
      } else {
        const document = (operation === 'generateCarousel' ? outputSchemaFor(operation, input) : schemas.generateStaticPost).parse(adapterResult.data) as import('../../shared/content').Carousel;
        // Fail the whole draft if a citation is invented; retaining its associated
        // prose after merely dropping the citation could leave unsupported claims.
        if (!document.research?.sources.length || document.research.sources.some(source => !retrievedUrls.has(source.url))) throw new StudioError('RESEARCH_UNVERIFIED', 'Research did not return verifiable source links. Try again; your existing draft is unchanged.');
        adapterResult.data = document;
      }
    }
    return adapterResult;
  };
}
