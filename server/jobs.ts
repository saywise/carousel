import { load } from 'cheerio';
import { canonicalJobUrl, generalizeRole, jobListingSchema, type JobListing } from '../shared/jobs';
import { StudioError } from './errors';

const unreadable = () => new StudioError('JOB_UNREADABLE', 'The listing could not be read. Check that it is a public Saywise job link and try again. No company or role was guessed.', 422);
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

export function parseJobPage(html: string, jobUrl: string): JobListing {
  const $ = load(html); // Parse only; scripts and linked resources are never executed.
  let jobTitle = '', company = '', summary = '';
  // Prefer the standard JobPosting representation when a page provides one.
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || jobTitle) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const item = value as Record<string, unknown>;
    if (item['@type'] === 'JobPosting' || Array.isArray(item['@type']) && item['@type'].includes('JobPosting')) {
      const organization = item.hiringOrganization as { name?: unknown } | undefined;
      if (typeof item.title === 'string' && typeof organization?.name === 'string') {
        jobTitle = clean(item.title); company = clean(organization.name);
        if (typeof item.description === 'string') summary = clean(load(item.description).text());
      }
    }
    if (item['@graph']) visit(item['@graph']);
  };
  $('script[type="application/ld+json"]').each((_index, script) => { try { visit(JSON.parse($(script).text())); } catch { /* Try the public page metadata next. */ } });
  if (!jobTitle || !company) {
    const pageTitle = clean($('meta[property="og:title"]').attr('content') || $('title').text());
    const match = pageTitle.match(/^(.+?)\s+·\s+(.+?)\s*\|\s*Saywise$/i);
    if (!match) throw unreadable();
    [, jobTitle, company] = match;
    // A mismatched visible heading is a changed template/error, not evidence to guess.
    const heading = clean($('h1').first().text());
    if (heading && heading !== jobTitle) throw unreadable();
  }
  summary ||= clean($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '');
  const result = jobListingSchema.safeParse({ jobUrl, jobTitle, company, role: generalizeRole(jobTitle), summary: summary.slice(0, 3000), fetchedAt: new Date().toISOString() });
  if (!result.success) throw unreadable();
  return result.data;
}

export function createJobResolver(fetchPage: typeof fetch = fetch) {
  const cache = new Map<string, { listing: JobListing; expires: number }>();
  return async (rawUrl: string): Promise<JobListing> => {
    let jobUrl: string;
    try { jobUrl = canonicalJobUrl(rawUrl); } catch { throw new StudioError('JOB_URL_INVALID', 'Paste a valid https://saywise.com/j/… job link.', 400); }
    const cached = cache.get(jobUrl);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.listing);
    const signal = AbortSignal.timeout(15000);
    let url = jobUrl;
    try {
      for (let redirects = 0; redirects <= 2; redirects++) {
        // Only this public origin/path is fetchable. No cookies, credentials or
        // external redirect targets are forwarded from the browser.
        const response = await fetchPage(url, { redirect: 'manual', signal, headers: { Accept: 'text/html', 'User-Agent': 'Saywise-Content-Studio/0.1' } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw unreadable();
          const target = new URL(location, url);
          // Validate before following, retaining www when a canonical redirect requires it.
          if (canonicalJobUrl(target.href) !== jobUrl) throw unreadable();
          target.search = ''; target.hash = ''; url = target.href;
          continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new StudioError('JOB_UNAVAILABLE', response.status === 404 || response.status === 410 ? 'This Saywise job link is unavailable. Check the URL or try another listing.' : 'Saywise could not return the listing. Please try again shortly.', 422); }
        if (!response.headers.get('content-type')?.includes('text/html') || !response.body) { await response.body?.cancel(); throw unreadable(); }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let bytes = 0;
        try {
          while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 1_500_000) throw unreadable(); chunks.push(chunk.value); }
        } finally { await reader.cancel(); reader.releaseLock(); }
        const listing = parseJobPage(Buffer.concat(chunks).toString('utf8'), jobUrl);
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(jobUrl, { listing, expires: Date.now() + 5 * 60_000 });
        return structuredClone(listing);
      }
      throw unreadable();
    } catch (error) {
      if (error instanceof StudioError) throw error;
      if (signal.aborted) throw new StudioError('JOB_TIMEOUT', 'Reading the job listing timed out. Please try again.', 504);
      throw unreadable();
    }
  };
}
export const resolveJob = createJobResolver();
