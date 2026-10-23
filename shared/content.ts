import { z } from 'zod';
import { artworkIds, brandThemes } from './brand';
import { jobListingSchema, jobRequestSchema } from './jobs';

const isWebUrl = (value: string) => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
// Not .url(): OpenAI structured outputs reject the JSON Schema `format: "uri"` it emits.
export const webUrl = z.string().max(1000).refine(isWebUrl, 'Use an http or https link.');
export const contentPlanSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('general') }),
  z.object({ type: z.literal('company'), company: z.string().trim().min(1).max(120), jobTitle: z.string().trim().min(1).max(120), jobUrl: webUrl, role: z.string().trim().min(1).max(120).optional(), listing: jobListingSchema.optional() }),
  z.object({ type: z.literal('job'), jobTitle: z.string().trim().min(1).max(120), jobUrl: webUrl, company: z.string().trim().min(1).max(120).optional(), role: z.string().trim().min(1).max(120).optional(), listing: jobListingSchema.optional() }),
]);
export type ContentPlan = z.infer<typeof contentPlanSchema>;
export const researchSchema = z.object({ summary: z.string().max(2000), sources: z.array(z.object({ title: z.string().max(200), url: webUrl, supports: z.string().max(600) })).max(12) });
export const imageDataSchema = z.string().max(7_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
export const jobSections = ['hook', 'work', 'shift', 'skills', 'opportunity'] as const;
export const jobSectionLabels = { hook: 'The hook · understand the role', work: 'Inside the work · three responsibilities', shift: 'What’s changing · one sourced shift', skills: 'What makes someone good · three skills', opportunity: 'Your next role · the exact Saywise listing' };
export const companySections = ['overview', 'product', 'founders', 'growth', 'opportunity'] as const;
export const pointSchema = z.object({ title: z.string().min(1).max(60), detail: z.string().max(130) });
export const libraryImageSchema = z.object({
  src: z.string().regex(/^\/(?:brand\/saywise\/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|webp|svg)|company\/[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg|webp|svg)|api\/assets\/[a-f0-9-]{36}\/image)$/).refine(path => !path.includes('..')),
  label: z.string().max(200), provenance: z.enum(['brand', 'company', 'uploaded', 'generated', 'edited', 'demo']),
  sourceUrl: webUrl.optional(), credit: z.string().max(200).optional(),
});
export type LibraryImage = z.infer<typeof libraryImageSchema>;
export const assetUploadSchema = z.object({ dataUrl: imageDataSchema, label: z.string().min(1).max(200), provenance: libraryImageSchema.shape.provenance });
export const draftContextSchema = z.object({ topic: z.string().max(2000), audience: z.string().max(400), tone: z.string().max(200), plan: contentPlanSchema });

const generatedSlideSchema = z.object({
  eyebrow: z.string().max(60), title: z.string().min(1).max(120),
  body: z.string().max(450), footer: z.string().max(90),
  theme: z.enum(brandThemes),
});
// Artwork is an editor-controlled asset layer, not generated JSON. Legacy theme
// names remain readable so existing saved projects need no destructive migration.
export const slideSchema = generatedSlideSchema.extend({
  theme: z.enum([...brandThemes, 'lime', 'ink', 'paper']),
  artwork: z.enum(artworkIds).optional(),
  image: libraryImageSchema.optional(), reference: libraryImageSchema.optional(),
  coverImage: libraryImageSchema.optional(), companyLogo: libraryImageSchema.optional(),
  revisionPrompt: z.string().max(3000).optional(), imagePrompt: z.string().max(2000).optional(),
  jobSection: z.enum(jobSections).optional(), companySection: z.enum(companySections).optional(), points: z.array(pointSchema).max(3).optional(),
  imageBlur: z.number().min(0).max(24).optional(),
  cta: z.object({ jobTitle: z.string().max(120), url: webUrl }).optional(),
});
export const carouselSchema = z.object({
  title: z.string().min(1).max(160), slides: z.array(slideSchema).min(1).max(10),
  caption: z.string().max(2400), hashtags: z.array(z.string().max(60)).max(12),
  context: draftContextSchema.optional(), research: researchSchema.optional(),
});
const generatedDocumentSchema = carouselSchema.omit({ context: true, research: true }).extend({ research: researchSchema });
export const schemas = {
  generateContentBrief: z.object({ title: z.string(), audience: z.string(), objective: z.string(), keyMessages: z.array(z.string()), callToAction: z.string() }),
  generateCarousel: generatedDocumentSchema.extend({ slides: z.array(generatedSlideSchema).min(1).max(10) }),
  generateStaticPost: generatedDocumentSchema.extend({ slides: z.array(generatedSlideSchema).length(1) }),
  rewriteSlide: generatedSlideSchema,
  generateCaption: z.object({ caption: z.string().max(2400), hashtags: z.array(z.string().max(60)).max(12) }),
  recommendTrendingTopics: z.object({ topics: z.array(z.object({ title: z.string(), angle: z.string(), evidence: z.enum(['suggested', 'source-backed']), sources: z.array(z.object({ title: z.string(), url: webUrl })) })).min(1).max(8) }),
  generateIllustration: z.object({ dataUrl: z.string().startsWith('data:image/'), alt: z.string(), provenance: z.enum(['generated', 'edited', 'demo']) }),
};
export const companySlideSchema = generatedSlideSchema.extend({
  title: z.string().min(1).max(90), body: z.string().max(300),
  points: z.array(pointSchema).max(3),
});
// Named required sections avoid duplicated or reordered slides in model output.
// The service converts this wire contract into the same editable slide array.
export const companyCarouselSchema = generatedDocumentSchema.extend({ slides: z.object({
  overview: companySlideSchema,
  product: companySlideSchema.extend({ points: z.array(pointSchema).length(3) }),
  founders: companySlideSchema,
  growth: companySlideSchema.extend({ points: z.array(pointSchema).length(3) }),
  opportunity: companySlideSchema,
}) });
export const jobSlideSchema = generatedSlideSchema.extend({
  title: z.string().min(1).max(90), body: z.string().max(240),
  points: z.array(pointSchema).max(3),
});
export const jobCarouselSchema = generatedDocumentSchema.extend({ slides: z.object({
  hook: jobSlideSchema.extend({ points: z.array(pointSchema).length(0) }),
  work: jobSlideSchema.extend({ points: z.array(pointSchema).length(3) }),
  shift: jobSlideSchema.extend({ points: z.array(pointSchema).length(0) }),
  skills: jobSlideSchema.extend({ points: z.array(pointSchema).length(3) }),
  opportunity: jobSlideSchema.extend({ points: z.array(pointSchema).length(0) }),
}) });
export function outputSchemaFor(operation: Operation, input: GenerationInput) {
  if (input.plan?.type === 'job' && operation === 'generateCarousel') return jobCarouselSchema;
  if (input.slide?.jobSection && operation === 'rewriteSlide') return jobSlideSchema.extend({ points: z.array(pointSchema).length(['work', 'skills'].includes(input.slide.jobSection) ? 3 : 0) });
  if (input.plan?.type === 'company' && operation === 'generateCarousel') return companyCarouselSchema;
  if (input.slide?.companySection && operation === 'rewriteSlide') return ['product', 'growth'].includes(input.slide.companySection) ? companySlideSchema.extend({ points: z.array(pointSchema).length(3) }) : companySlideSchema;
  return schemas[operation];
}
export type Operation = keyof typeof schemas;
export type TextOperation = Exclude<Operation, 'generateIllustration'>;
export type Output<K extends Operation> = K extends 'generateCarousel' | 'generateStaticPost' ? Carousel : z.infer<(typeof schemas)[K]>;
export type Slide = z.infer<typeof slideSchema>;
export type Carousel = z.infer<typeof carouselSchema>;
export const operationSchema = z.enum(Object.keys(schemas) as [Operation, ...Operation[]]);
export const inputSchema = z.object({
  topic: z.string().max(2000).default(''), audience: z.string().max(400).default('Curious professionals'),
  tone: z.string().max(200).default('Clear, thoughtful, practical'),
  instructions: z.string().max(3000).default(''), slide: slideSchema.optional(),
  plan: contentPlanSchema.optional(), research: researchSchema.optional(),
  jobRequest: jobRequestSchema.optional(),
  // Uploaded image bytes only: no arbitrary server URL fetching.
  imageDataUrl: imageDataSchema.optional(), referenceDataUrl: imageDataSchema.optional(),
});
export type GenerationInput = z.infer<typeof inputSchema>;
export type Mode = 'demo' | 'codex' | 'openai';
export interface Usage {
  inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null;
  images: number; webSearches: number; estimatedCostUsd: number | null;
}
export interface GenerationResult<K extends Operation> {
  data: Output<K>; meta: { mode: Mode; model: string; requestId: string; notice: string; usage: Usage };
}
export type GenerationService = { [K in Operation]: (input: GenerationInput) => Promise<GenerationResult<K>> };
export const projectSchema = z.object({
  id: z.string().uuid(), content: carouselSchema, updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;
