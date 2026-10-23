import { z } from 'zod';

export function canonicalJobUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || !['saywise.com', 'www.saywise.com'].includes(url.hostname) || url.username || url.password || url.port || !/^\/j\/[A-Za-z0-9_-]{6,128}\/?$/.test(url.pathname)) throw new Error('Paste a Saywise job URL such as https://saywise.com/j/d0e2ade659aa.');
  return `https://saywise.com${url.pathname.replace(/\/$/, '')}`;
}
export const saywiseJobUrlSchema = z.string().trim().max(1000).transform((value, context) => {
  try { return canonicalJobUrl(value); } catch { context.addIssue({ code: 'custom', message: 'Paste a valid https://saywise.com/j/… job link.' }); return z.NEVER; }
});

// Deterministic role families keep a listing's seniority/team from narrowing an
// explainer. Unknown occupations keep their wording and can be adjusted in UI.
export function generalizeRole(title: string): string {
  const families = [
    'Product Marketing Manager', 'Technical Program Manager', 'Engineering Manager',
    'Product Manager', 'Project Manager', 'Program Manager', 'Product Designer',
    'UX Designer', 'UX Researcher', 'User Experience Designer', 'User Experience Researcher',
    'Software Engineer', 'Software Developer', 'Data Scientist', 'Data Engineer', 'Data Analyst',
    'Machine Learning Engineer', 'AI Engineer', 'Research Scientist', 'Security Engineer',
    'Solutions Engineer', 'Sales Engineer', 'Customer Success Manager', 'Account Executive',
    'Account Manager', 'Marketing Manager', 'Business Analyst', 'Financial Analyst',
    'Operations Manager', 'Recruiter', 'Registered Nurse', 'Accountant', 'Lead Generation Specialist',
  ];
  // Disambiguate compound titles instead of choosing whichever family comes first.
  const matches = families.filter(role => new RegExp(`\\b${role}\\b`, 'i').test(title));
  if (matches.length === 1) return matches[0];
  const withoutLevel = title.trim().replace(/^(?:(?:senior|sr\.?|junior|jr\.?|staff|principal|lead|associate|entry[- ]level)\s+)+/i, '');
  return withoutLevel.replace(/\s*(?:[,|]|\s[–—-]\s)\s*.+$/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+(?:I{1,3}|IV|[1-5])$/i, '').trim() || title.trim();
}

export const jobListingSchema = z.object({
  jobUrl: saywiseJobUrlSchema, company: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().min(1).max(120), role: z.string().trim().min(1).max(120),
  summary: z.string().max(3000), fetchedAt: z.string().datetime(),
});
export type JobListing = z.infer<typeof jobListingSchema>;
export const jobRequestSchema = z.object({
  type: z.enum(['company', 'job']), jobUrl: saywiseJobUrlSchema,
  roleOverride: z.string().trim().min(1).max(120).optional(),
});
