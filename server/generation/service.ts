import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { ZodError } from 'zod';
import { schemas, jobCarouselSchema, jobSections, companyCarouselSchema, outputSchemaFor, inputSchema, carouselSchema, type GenerationService, type Operation, type GenerationInput, type GenerationResult } from '../../shared/content';
import type { Config } from '../config';
import type { Store } from '../store';
import { StudioError } from '../errors';
import { demoOutput } from './demo';
import { codexGenerate } from './codex';
import { createOpenAIAdapter } from './openai';
import { unknownUsage, type AdapterResult } from './types';
import { needsResearch } from './prompts';
import { resolveJob } from '../jobs';
import { generalizeRole } from '../../shared/jobs';
import { mediaForCompany } from '../../shared/company';
import { companySections } from '../../shared/content';
import { validateCompanyLogo } from '../company-logo';

export function createGenerationService(config: Config, store: Store, apiClient?: OpenAI, readJob = resolveJob): GenerationService {
  const api = config.GENERATION_MODE === 'openai' ? createOpenAIAdapter(config, apiClient) : undefined;
  async function execute<K extends Operation>(operation: K, rawInput: GenerationInput): Promise<GenerationResult<K>> {
    const input = inputSchema.parse(rawInput);
    if (input.jobRequest) {
      const listing = await readJob(input.jobRequest.jobUrl);
      input.plan = { type: input.jobRequest.type, company: listing.company, jobTitle: listing.jobTitle, jobUrl: listing.jobUrl, role: input.jobRequest.roleOverride ?? listing.role, listing };
    }
    if (input.plan && input.plan.type !== 'general') {
      input.plan.role ??= generalizeRole(input.plan.jobTitle);
      input.topic = input.topic.trim() || (input.plan.type === 'company' ? `Introduce ${input.plan.company} and what makes its work interesting.` : `Explain the ${input.plan.role} role, current angles and core skills.`);
    }
    if (!input.topic.trim()) throw new StudioError('TOPIC_REQUIRED', 'Enter a topic or provide a Saywise job link.', 400);
    if (operation === 'rewriteSlide' && !input.slide) throw new StudioError('SLIDE_REQUIRED', 'Select a slide to rewrite.', 400);
    if (needsResearch(operation, input) && config.GENERATION_MODE !== 'demo' && config.ENABLE_WEB_RESEARCH !== 'true') throw new StudioError('RESEARCH_DISABLED', 'Company and job posts require live research. Enable ENABLE_WEB_RESEARCH on the server, or use demonstration mode.', 400);
    const id = randomUUID();
    let observed: AdapterResult | undefined;
    try {
      let result: AdapterResult;
      if (api) result = await api(operation, input, usage => { observed = usage; });
      else if (config.GENERATION_MODE === 'codex' && operation !== 'generateIllustration') result = await codexGenerate(config, operation, input);
      else result = { data: demoOutput(operation, input), model: 'saved-fixture', usage: { ...unknownUsage(), estimatedCostUsd: 0 }, notice: config.GENERATION_MODE === 'codex' ? 'Image generation is not supported by this Codex adapter. Showing a saved demo illustration.' : 'Saved demonstration content. Your prompt is not sent to a model; edit this example freely.' };
      observed = result;
      const data = outputSchemaFor(operation, input).parse(result.data);
      if (operation === 'recommendTrendingTopics' && !api && !result.usage.webSearches) {
        const topics = schemas.recommendTrendingTopics.parse(data);
        topics.topics.forEach(topic => { topic.evidence = 'suggested'; topic.sources = []; });
        result.data = topics;
      } else result.data = data;
      if (operation === 'generateCarousel' || operation === 'generateStaticPost') {
        const companyDraft = input.plan?.type === 'company' && operation === 'generateCarousel' ? companyCarouselSchema.parse(data) : undefined;
        const jobDraft = input.plan?.type === 'job' && operation === 'generateCarousel' ? jobCarouselSchema.parse(data) : undefined;
        const document = carouselSchema.parse(jobDraft ? { ...jobDraft, slides: jobSections.map(section => ({ ...jobDraft.slides[section], jobSection: section })) } : companyDraft ? { ...companyDraft, slides: companySections.map(section => ({ ...companyDraft.slides[section], companySection: section })) } : data);
        if (needsResearch(operation, input) && result.model !== 'saved-fixture' && (!result.usage.webSearches || !document.research?.sources.length)) throw new StudioError('RESEARCH_MISSING', 'No live research sources were returned. Please retry; your current draft is unchanged.');
        document.context = { topic: input.topic, audience: input.audience, tone: input.tone, plan: input.plan ?? { type: 'general' } };
        if (input.plan?.type === 'company' && operation === 'generateCarousel') {
          if (document.slides.length !== 5 || document.slides.some((slide, index) => slide.companySection !== companySections[index]) || document.slides[1].points?.length !== 3 || document.slides[3].points?.length !== 3) throw new StudioError('COMPANY_STRUCTURE', 'Company Spotlight requires five slides in order: company, product, founders, growth and opportunity. Please retry.');
          const media = mediaForCompany(input.plan.company);
          if (media?.logo) await validateCompanyLogo(media.logo, store, config.NODE_ENV === 'production');
          document.slides.forEach((slide, index) => {
            slide.companySection = companySections[index]; slide.footer = ''; slide.artwork = 'none';
            slide.eyebrow = `Company Spotlight · ${input.plan!.type === 'company' ? input.plan!.company : ''}`.slice(0, 60);
            slide.image = index === 0 ? media?.logo : index === 1 ? media?.product : index === 2 ? media?.founders : undefined;
            if (index === 2) slide.imageBlur = 8;
            if (index === 0) slide.coverImage = media?.product;
          });
        }
        if (input.plan?.type === 'job' && operation === 'generateCarousel') {
          const media = input.plan.company ? mediaForCompany(input.plan.company) : undefined;
          if (media?.logo) await validateCompanyLogo(media.logo, store, config.NODE_ENV === 'production');
          document.slides.forEach((slide, index) => {
            slide.footer = ''; slide.eyebrow = `Job Explainer · ${input.plan!.type === 'job' ? input.plan!.role : ''}`.slice(0, 60);
            slide.artwork = index === 0 || index === 2 ? 'sage' : 'none';
            if (index === 4) slide.companyLogo = media?.logo;
          });
        }
        if (input.plan && input.plan.type !== 'general') {
          document.slides.at(-1)!.cta = { jobTitle: input.plan.jobTitle, url: input.plan.jobUrl };
          const hook = `Explore ${input.plan.jobTitle} on Saywise: ${input.plan.jobUrl}`;
          if (!document.caption.includes(input.plan.jobUrl) || !document.caption.includes(input.plan.jobTitle)) document.caption = document.caption.slice(0, 2398 - hook.length) + '\n\n' + hook;
        }
        result.data = carouselSchema.parse(document);
      }
      if (operation === 'rewriteSlide') {
        const rewritten = { ...input.slide, ...outputSchemaFor(operation, input).parse(data) };
        if (['product', 'growth'].includes(input.slide?.companySection ?? '') && ('points' in rewritten ? rewritten.points?.length : 0) !== 3) throw new StudioError('COMPANY_STRUCTURE', 'Keep exactly three points when revising this slide.');
        if (input.slide?.companySection || input.slide?.jobSection) rewritten.footer = '';
        result.data = rewritten;
      }
      if (operation === 'generateCaption' && input.plan && input.plan.type !== 'general') {
        const caption = schemas.generateCaption.parse(data);
        const hook = `Explore ${input.plan.jobTitle} on Saywise: ${input.plan.jobUrl}`;
        result.data = { ...caption, caption: caption.caption.includes(input.plan.jobUrl) && caption.caption.includes(input.plan.jobTitle) ? caption.caption : caption.caption.slice(0, 2398 - hook.length) + '\n\n' + hook };
      }
      const mode = result.model === 'saved-fixture' ? 'demo' : config.GENERATION_MODE;
      store.recordUsage({ ...result.usage, id, createdAt: new Date().toISOString(), mode, model: result.model, operation, status: 'completed', errorCode: null });
      return { data: result.data as GenerationResult<K>['data'], meta: { mode, model: result.model, requestId: id, notice: result.notice, usage: result.usage } };
    } catch (error) {
      let failure: StudioError;
      if (error instanceof StudioError) failure = error;
      else if (error instanceof ZodError) failure = new StudioError('INVALID_OUTPUT', 'Generated content failed schema validation. Please try again.');
      else if (error instanceof OpenAI.APIConnectionTimeoutError || error instanceof OpenAI.APIUserAbortError) failure = new StudioError('TIMEOUT', 'Generation timed out. Please try again.', 504);
      else if (error instanceof OpenAI.APIError) {
        failure = new StudioError(error.status === 429 ? 'RATE_LIMIT' : error.status === 401 ? 'AUTH_FAILED' : 'OPENAI_ERROR', error.status === 429 ? 'OpenAI is rate limiting requests. Wait a moment and retry.' : error.status === 401 ? 'OpenAI authentication failed. Check the server API key.' : 'OpenAI could not complete the request. Check server configuration and retry.', error.status === 429 ? 429 : 502);
      } else if (error instanceof Error && /abort|timeout/i.test(error.name)) failure = new StudioError('TIMEOUT', 'Generation timed out. Please try again.', 504);
      else failure = new StudioError('GENERATION_FAILED', 'Generation failed. Check your server configuration or try demo mode.');
      store.recordUsage({ ...(observed?.usage ?? unknownUsage()), id, createdAt: new Date().toISOString(), mode: config.GENERATION_MODE, model: observed?.model ?? (operation === 'generateIllustration' ? config.OPENAI_IMAGE_MODEL : config.OPENAI_TEXT_MODEL), operation, status: 'failed', errorCode: failure.code });
      throw failure;
    }
  }
  return Object.fromEntries(Object.keys(schemas).map(operation => [operation, (input: GenerationInput) => execute(operation as Operation, input)])) as GenerationService;
}
