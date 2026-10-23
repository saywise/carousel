import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, CircleHelp, FileText, FolderOpen, Layers3, LayoutGrid, LoaderCircle, Plus, Save, Sparkles, WandSparkles, X, Image as ImageIcon, Activity, Upload, Palette } from 'lucide-react';
import { getFontEmbedCSS, toPng } from 'html-to-image';
import { demoCarousel } from '../shared/demo';
import { jobSectionLabels, carouselSchema, slideSchema, schemas, type ContentPlan, type LibraryImage, type Carousel, type GenerationResult, type Operation, type Output, type Project, type Slide as SlideData } from '../shared/content';
import { saywiseJobUrlSchema, generalizeRole, type JobListing } from '../shared/jobs';
import { Slide } from './Slide';
import { renderSlideArchive } from './export-slides';
import { BrandLibrary } from './BrandLibrary';
import { companyMedia, companySectionLabels } from '../shared/company';
import { artworkOptions, brandAssets, brandBase, brandThemes, imageReferences, resolveTheme, themeLabels } from '../shared/brand';

async function imageAsDataUrl(src: string): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error('The selected brand reference could not be loaded.');
  const blob = await response.blob();
  if (blob.type.includes('svg')) {
    const url = URL.createObjectURL(blob);
    try { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.max(1, Math.round(1024 * image.naturalHeight / image.naturalWidth)); canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/png'); }
    finally { URL.revokeObjectURL(url); }
  }
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the reference image.')); reader.readAsDataURL(blob); });
}

async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/${path}`, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}
function download(url: string, name: string) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
export function App() {
  const [content, setContent] = useState<Carousel>(() => structuredClone(demoCarousel));
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID());
  const [selected, setSelected] = useState(0);
  const [topic, setTopic] = useState('How to have more meaningful conversations');
  const [audience, setAudience] = useState('Curious professionals');
  const [tone, setTone] = useState('Thoughtful & practical');
  const [format, setFormat] = useState('carousel');
  const [contentType, setContentType] = useState<ContentPlan['type']>('general');
  const [jobUrl, setJobUrl] = useState('');
  const [jobListing, setJobListing] = useState<JobListing>();
  const [explainerRole, setExplainerRole] = useState('');
  const [direction, setDirection] = useState('');
  const [assets, setAssets] = useState<LibraryImage[]>([]);
  const [previous, setPrevious] = useState<Carousel>();
  const [editCurrent, setEditCurrent] = useState(true);
  const [imageTarget, setImageTarget] = useState<'image' | 'coverImage' | 'companyLogo'>('image');
  const [status, setStatus] = useState<{ mode: string; researchEnabled: boolean; imageMode: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('You’re editing a saved example. Make it your own.');
  const [saved, setSaved] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [panel, setPanel] = useState<'library' | 'brand' | 'research' | 'brief' | 'image' | 'usage' | 'help' | null>(null);
  const [brief, setBrief] = useState<Output<'generateContentBrief'>>();
  const [topics, setTopics] = useState<Output<'recommendTrendingTopics'>>();
  const [illustration, setIllustration] = useState<LibraryImage>();
  const [usage, setUsage] = useState<Array<{ id: string; operation: string; model: string; mode: string; status: string; inputTokens: number | null; outputTokens: number | null; images: number; estimatedCostUsd: number | null }>>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [archive, setArchive] = useState<{ url: string; count: number }>();
  useEffect(() => () => { if (archive) URL.revokeObjectURL(archive.url); }, [archive]);
  const slide = content.slides[selected] ?? content.slides[0];
  const companyName = content.context?.plan.type === 'company' ? content.context.plan.company : undefined;
  const jobPlan = content.context?.plan.type === 'job' ? content.context.plan : undefined;
  const isJobStory = !!jobPlan && !!slide.jobSection;
  const isCompanyCover = !!companyName && (slide.companySection === 'overview' || (!slide.companySection && selected === 0 && content.slides.length > 1));
  const isLogoTarget = (isCompanyCover && imageTarget === 'image') || imageTarget === 'companyLogo';
  const coverImage = slide.coverImage ?? (companyName ? companyMedia[companyName.toLowerCase()]?.product : undefined);
  const companyAssets = Object.values(companyMedia).flatMap(media => Object.values(media));
  const referencePreview = slide.reference?.src;
  const instruction = slide.revisionPrompt ?? 'Make it shorter and more conversational.';
  const jobUrlResult = saywiseJobUrlSchema.safeParse(jobUrl);
  const ready = contentType === 'general' ? !!topic.trim() : jobUrlResult.success && (!jobListing || contentType !== 'job' || !!explainerRole.trim());
  useEffect(() => { api<typeof status>('status').then(setStatus).catch(e => setError(e.message)); }, []);
  useEffect(() => { const fn = (event: BeforeUnloadEvent) => { if (!saved) event.preventDefault(); }; window.addEventListener('beforeunload', fn); return () => window.removeEventListener('beforeunload', fn); }, [saved]);
  function change(next: Carousel) { setContent(next); setSaved(false); setArchive(undefined); }
  function updateSlide(patch: Partial<SlideData>) { change({ ...content, slides: content.slides.map((s, i) => i === selected ? { ...s, ...patch } : s) }); }
  async function perform(label: string, task: () => Promise<void>) { setBusy(label); setError(''); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(null); } }
  async function readListing() {
    if (!jobUrlResult.success) throw new Error('Paste a Saywise job link such as https://saywise.com/j/d0e2ade659aa.');
    const listing = await api<JobListing>('jobs/resolve', { jobUrl: jobUrlResult.data });
    setJobListing(listing); setExplainerRole(listing.role); setJobUrl(listing.jobUrl);
    setNotice(`Imported ${listing.jobTitle} at ${listing.company}. Explainer topic: ${listing.role}.`);
    return listing;
  }
  async function generate<K extends Operation>(operation: K): Promise<Output<K>> {
    const isDraft = ['generateCarousel', 'generateStaticPost', 'generateContentBrief', 'recommendTrendingTopics'].includes(operation);
    if (isDraft && !ready) throw new Error(contentType === 'general' ? 'Enter a topic.' : 'Paste a valid Saywise job link and check the explainer topic.');
    if (isDraft && contentType !== 'general' && (!jobListing || jobListing.jobUrl !== jobUrlResult.data)) await readListing();
    const context = isDraft ? { topic: contentType === 'general' ? topic : direction, audience, tone,
      ...(contentType === 'general' ? { plan: { type: 'general' } } : { jobRequest: { type: contentType, jobUrl: jobUrlResult.data, ...(jobListing && explainerRole.trim() && explainerRole !== jobListing.role ? { roleOverride: explainerRole.trim() } : {}) } }),
    } : content.context ?? { topic, audience, tone, plan: { type: 'general' } };
    const currentImage = operation === 'generateIllustration' && editCurrent ? (isCompanyCover ? coverImage : slide.image) : undefined;
    const imageDataUrl = operation === 'generateIllustration' && status?.imageMode === 'openai' && (currentImage || slide.reference) ? await imageAsDataUrl((currentImage ?? slide.reference)!.src) : undefined;
    const referenceDataUrl = operation === 'generateIllustration' && status?.imageMode === 'openai' && currentImage && slide.reference && currentImage.src !== slide.reference.src ? await imageAsDataUrl(slide.reference.src) : undefined;
    const response = await api<GenerationResult<K>>(`generate/${operation}`, { ...context, instructions: operation === 'generateIllustration' ? slide.imagePrompt || 'Create a supporting editorial illustration for this slide.' : isDraft ? '' : instruction, slide, ...(isDraft ? {} : { research: content.research }), ...(imageDataUrl ? { imageDataUrl } : {}), ...(referenceDataUrl ? { referenceDataUrl } : {}) });
    setNotice(response.meta.notice);
    return (operation === 'generateCarousel' || operation === 'generateStaticPost' ? carouselSchema : operation === 'rewriteSlide' ? slideSchema : schemas[operation]).parse(response.data) as Output<K>;
  }
  function chooseReference(image: LibraryImage) { setImageTarget(isCompanyCover ? 'coverImage' : 'image'); updateSlide({ reference: image }); setIllustration(undefined); setPanel('image'); }
  function applyImage(image: LibraryImage) { void perform('Applying image', async () => { if (isLogoTarget) await api('assets/validate-logo', { image }); setPrevious(structuredClone(content)); updateSlide({ [imageTarget]: image }); setPanel(null); setNotice(`${isLogoTarget ? 'Transparent PNG logo' : 'Image'} applied to slide ${selected + 1}.`); }); }
  async function uploadImage(file: File) {
    if (file.size > 5_000_000) throw new Error('Choose a PNG, JPEG or WebP smaller than 5 MB.');
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    const image = await api<LibraryImage>('assets', { dataUrl, label: file.name.slice(0, 200), provenance: 'uploaded' });
    setAssets(existing => [image, ...existing]); if (isLogoTarget) { await api('assets/validate-logo', { image }); setPrevious(structuredClone(content)); updateSlide({ [imageTarget]: image }); setPanel(null); setNotice('Transparent PNG logo applied.'); } else chooseReference(image);
  }
  const save = () => perform('Saving', async () => {
    await api(`projects/${projectId}`, { content, updatedAt: new Date().toISOString() }, 'PUT'); setSaved(true); setNotice('Project saved to your studio.');
  });
  const openPanel = (next: typeof panel, target: 'image' | 'coverImage' | 'companyLogo' = 'image') => { setImageTarget(next === 'image' && isCompanyCover ? 'coverImage' : target); setPanel(next); if (next === 'image') setIllustration(undefined); if (next === 'library') void perform('Loading library', async () => { const [savedProjects, savedAssets] = await Promise.all([api<Project[]>('projects'), api<LibraryImage[]>('assets')]); setProjects(savedProjects); setAssets(savedAssets); }); if (next === 'usage') void perform('Loading usage', async () => setUsage(await api('usage'))); };
  function loadProject(project: Project) { setArchive(undefined); setContent(project.content); setProjectId(project.id); setSelected(0); setSaved(true); setPrevious(undefined); setPanel(null); const context = project.content.context; if (context) { setTopic(context.topic); setAudience(context.audience); setTone(context.tone); setContentType(context.plan.type); setJobUrl(context.plan.type !== 'general' ? context.plan.jobUrl : ''); setJobListing(context.plan.type !== 'general' ? context.plan.listing : undefined); setExplainerRole(context.plan.type !== 'general' ? context.plan.role ?? generalizeRole(context.plan.jobTitle) : ''); setDirection(context.plan.type !== 'general' ? context.topic : ''); } setFormat(project.content.slides.length === 1 ? 'static' : 'carousel'); setNotice('Saved project opened.'); }
  async function validateLogos(document: Carousel) {
    for (const item of document.slides) if (item.companyLogo) await api('assets/validate-logo', { image: item.companyLogo });
    if (document.context?.plan.type !== 'company') return;
    for (const [index, item] of document.slides.entries()) if (item.image && (item.companySection === 'overview' || (!item.companySection && index === 0 && document.slides.length > 1))) await api('assets/validate-logo', { image: item.image });
  }
  async function exportPng() {
    if (slide.companyLogo) await api('assets/validate-logo', { image: slide.companyLogo });
    if (isCompanyCover && slide.image) await api('assets/validate-logo', { image: slide.image });
    await document.fonts.ready;
    const node = canvasRef.current?.querySelector<HTMLElement>('.slide');
    if (!node) return;
    await Promise.all(Array.from(node.querySelectorAll('img')).map(image => image.decode()));
    const data = await toPng(node, { width: 540, height: 675, pixelRatio: 2, cacheBust: false });
    download(data, `saywise-slide-${selected + 1}.png`); setNotice('Slide exported at 1080 × 1350 px.');
  }
  async function exportAllPngs() {
    setArchive(undefined);
    await validateLogos(content);
    await document.fonts.ready;
    const nodes = Array.from(exportRef.current?.querySelectorAll<HTMLElement>(':scope > .slide') ?? []);
    if (nodes.length !== content.slides.length) throw new Error('The slide export could not be prepared. Please retry.');
    const fontEmbedCSS = await getFontEmbedCSS(nodes[0]);
    const zip = await renderSlideArchive(nodes, async node => {
      await Promise.all(Array.from(node.querySelectorAll('img')).map(image => image.decode()));
      return toPng(node, { width: 540, height: 675, pixelRatio: 2, cacheBust: false, fontEmbedCSS });
    }, (completed, total) => setBusy(`Exporting images · ${completed} of ${total}`));
    const url = URL.createObjectURL(new Blob([new Uint8Array(zip)], { type: 'application/zip' }));
    setArchive({ url, count: nodes.length });
    download(url, 'saywise-slides.zip');
    setNotice(`ZIP ready: ${nodes.length} numbered PNG${nodes.length === 1 ? '' : 's'}, each 1080 × 1350 px. Unzip, then upload the images in order.`);
  }
  const label = status?.mode === 'codex' ? 'Local Codex' : status?.mode === 'openai' ? 'OpenAI API' : status ? 'Demo workspace' : 'Connecting…';
  return <fieldset className="app-shell studio-controls" disabled={!!busy}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Saywise home"><img className="brand-wordmark" src={brandAssets.logo} alt="Saywise"/><img className="brand-mobile-mark" src={brandAssets.icon} alt=""/></a>
      <div className="workspace"><div className="avatar"><img src={brandAssets.icon} alt=""/></div><div>Saywise workspace<small>Content Studio</small></div><ChevronDown size={14}/></div>
      <p className="nav-label">WORKSPACE</p>
      <nav><button className="nav-item active" onClick={() => setPanel(null)}><LayoutGrid size={18}/>Create content<span className="nav-dot"/></button><button className="nav-item" onClick={() => openPanel('library')}><FolderOpen size={18}/>My library</button><button className="nav-item" onClick={() => openPanel('research')}><Sparkles size={18}/>Topic inspiration</button><button className="nav-item" onClick={() => openPanel('usage')}><Activity size={18}/>Generation usage</button></nav>
      <button className="nav-item" onClick={() => openPanel('brand')}><Palette size={18}/>Brand kit</button>
      <div className="sidebar-note"><img className="sidebar-sage" src={brandAssets.sage} alt="Sage, the Saywise character"/><h3>Good ideas deserve<br/>a little more reach.</h3><p>Turn what you know into<br/>something worth sharing.</p></div>
      <button className="nav-item help" onClick={() => openPanel('help')}><CircleHelp size={18}/>Studio guide<ArrowUpRight size={14}/></button>
      <div className="profile"><img className="avatar user" src={`${brandBase}/sage/png/sage-avatar-circle-mist.png`} alt=""/><div>Saywise creator<small>Your creative workspace</small></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div>Workspace <span>/</span> <strong>Create content</strong></div><div className="mode"><i/>{label}</div></header>
      <main>
        <div className="page-heading"><div className="heading-copy"><div className="overline">A LITTLE KNOWLEDGE. A LOT OF POSSIBILITY.</div><h1>Let’s make something worth sharing.</h1><p>From a first thought to a finished post. All in your voice.</p></div><button className="button secondary" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })); download(url, 'saywise-content.json'); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><ArrowDownToLine size={16}/>Export JSON</button></div>
        {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        <div className="studio-grid">
          <section className="composer card"><div className="card-heading"><span className="step">01</span><h2>The starting point</h2></div><p className="muted intro">Bring the idea. We’ll help find the words.</p>
            <label>Post type<select value={contentType} onChange={e => setContentType(e.target.value as ContentPlan['type'])}><option value="general">General idea</option><option value="company">Company spotlight</option><option value="job">Job explainer</option></select></label>
            <p className="workflow-guide">{contentType === 'company' ? 'Five slides: company → product → founders → growth & backing → Saywise job' : contentType === 'job' ? 'Five slides: the role → daily work → what’s changing → skills → Saywise job' : 'Your idea → useful insights → closing action'}</p>
            {contentType !== 'general' && <>
              <label>Saywise job URL<input type="url" value={jobUrl} maxLength={1000} onChange={e => { setJobUrl(e.target.value); setJobListing(undefined); setExplainerRole(''); }} placeholder="https://saywise.com/j/d0e2ade659aa"/></label>
              <button className="text-button read-job" disabled={!!busy || !jobUrlResult.success} onClick={() => perform('Reading job listing', async () => { await readListing(); })}><ArrowDownToLine size={14}/>{jobListing ? 'Refresh job details' : 'Read job details'}</button>
              {!!jobUrl.trim() && !jobUrlResult.success && <p className="field-hint">Use a public https://saywise.com/j/… listing link.</p>}
              {jobListing && <div className="imported-job"><span className="overline">IMPORTED FROM SAYWISE</span><strong>{jobListing.company}</strong><p>{jobListing.jobTitle}</p>{contentType === 'job' && <label>Explainer topic<input value={explainerRole} maxLength={120} onChange={e => setExplainerRole(e.target.value)} placeholder="e.g. Product Manager"/></label>}<p className="field-hint">{contentType === 'job' ? 'The post explains this broader role. The closing hook uses the exact listing title.' : 'The post researches this company. The closing hook uses the exact listing title.'}</p><a href={jobListing.jobUrl} target="_blank" rel="noreferrer">View source listing ↗</a></div>}
              <p className="field-hint job-help">Paste one link; company and role details are extracted automatically. {status?.mode === 'demo' ? 'Demo drafts use labeled research placeholders.' : status?.researchEnabled ? 'Live research is enabled.' : 'Live research must be enabled on the server.'}</p>
            </>}
            <label>{contentType === 'general' ? 'What’s on your mind?' : 'Additional direction (optional)'}<textarea className="topic-input" value={contentType === 'general' ? topic : direction} maxLength={2000} onChange={e => contentType === 'general' ? setTopic(e.target.value) : setDirection(e.target.value)} placeholder={contentType === 'general' ? 'An idea, a lesson, a fresh perspective…' : 'An angle, audience question, or detail to emphasize…'}/></label>
            <button className="text-button inspire" onClick={() => openPanel('research')}><Sparkles size={14}/>Need a spark? Explore topics<ArrowUpRight size={13}/></button>
            <label>Content format</label><div className="format-options"><button className={format === 'carousel' ? 'selected' : ''} onClick={() => setFormat('carousel')}><Layers3 size={20}/><span>Carousel<small>A story in slides</small></span>{format === 'carousel' && <Check size={14}/>}</button><button className={format === 'static' ? 'selected' : ''} onClick={() => setFormat('static')}><FileText size={20}/><span>Static post<small>One strong idea</small></span>{format === 'static' && <Check size={14}/>}</button></div>
            <label>Who’s it for?<input value={audience} maxLength={400} onChange={e => setAudience(e.target.value)}/></label>
            <label>Make it sound<select value={tone} onChange={e => setTone(e.target.value)}><option>Thoughtful & practical</option><option>Warm & conversational</option><option>Bold & direct</option><option>Playful & curious</option></select></label>
            <button className="button primary generate" disabled={!!busy || !ready} onClick={() => perform('Creating your draft', async () => { const next = await generate(format === 'carousel' ? 'generateCarousel' : 'generateStaticPost'); if (next.context?.plan.type !== 'general' && next.context?.plan.listing) { setJobListing(next.context.plan.listing); setExplainerRole(next.context.plan.role ?? next.context.plan.listing.role); } setPrevious(structuredClone(content)); change(next); setProjectId(crypto.randomUUID()); setSelected(0); })}>{busy === 'Creating your draft' ? <LoaderCircle className="spin" size={17}/> : <WandSparkles size={17}/>} {status?.mode === 'demo' ? 'Load demo draft' : contentType === 'general' ? 'Create my draft' : 'Research & create draft'}<ArrowRight size={16}/></button>
            <div className="generation-note">{status?.mode === 'demo' ? 'Saved example · No API key needed' : 'OpenAI-powered · Always editable'}</div>
            <button className="brief-link" disabled={!!busy} onClick={() => perform('Creating brief', async () => { setBrief(await generate('generateContentBrief')); setPanel('brief'); })}><BookOpen size={15}/>Start with a content brief<ArrowUpRight size={13}/></button>
          </section>
          <section className="preview-section"><div className="preview-toolbar"><div><span className="step">02</span><h2>Your canvas</h2><span className="count">{content.slides.length} slides</span></div><span className="dimension">1080 × 1350</span></div>
            <div className="draft-context"><strong>{content.context?.plan.type === 'company' ? 'Company spotlight' : content.context?.plan.type === 'job' ? 'Job explainer' : 'General idea'} · {content.slides.length === 1 ? 'Static post' : 'Carousel'}</strong><span>{content.context?.topic ?? 'Saved demonstration'}</span>{previous && <button className="text-button" disabled={!!busy} onClick={() => { change(previous); setPrevious(undefined); setSelected(0); }}>Undo last AI / image change</button>}</div>
            {companyName && !content.slides.every(s => s.companySection) && content.slides.length > 1 && <div className="spotlight-structure"><strong>New Company Spotlight format</strong>Company · product · founders · growth & backing · Saywise job<button className="text-button" disabled={!!busy} onClick={() => perform('Rebuilding Company Spotlight', async () => { const result = await api<GenerationResult<'generateCarousel'>>('generate/generateCarousel', { ...content.context, instructions: '' }); setPrevious(structuredClone(content)); change(carouselSchema.parse(result.data)); setProjectId(crypto.randomUUID()); setSelected(0); setNotice(result.meta.notice); })}>Rebuild as five slides<ArrowRight size={13}/></button></div>}
            {jobPlan && !content.slides.every(s => s.jobSection) && content.slides.length > 1 && <div className="spotlight-structure"><strong>New Job Explainer format</strong>The role · daily work · what’s changing · skills · Saywise job<button className="text-button" disabled={!!busy} onClick={() => perform('Rebuilding Job Explainer', async () => { const result = await api<GenerationResult<'generateCarousel'>>('generate/generateCarousel', { ...content.context, instructions: '' }); setPrevious(structuredClone(content)); change(carouselSchema.parse(result.data)); setProjectId(crypto.randomUUID()); setSelected(0); setNotice(result.meta.notice); })}>Rebuild as five slides<ArrowRight size={13}/></button></div>}
            <div className="canvas-stage"><div className="canvas-fit"><div className="canvas" ref={canvasRef}><Slide slide={slide} index={selected} total={content.slides.length} company={companyName} jobPlan={jobPlan}/></div></div></div>
            <div className="slide-navigation"><span>Slide {selected + 1} <span className="muted">of {content.slides.length}</span></span><div><button aria-label="Previous slide" disabled={!selected} onClick={() => setSelected(selected - 1)}><ArrowLeft size={16}/></button><button aria-label="Next slide" disabled={selected === content.slides.length - 1} onClick={() => setSelected(selected + 1)}><ArrowRight size={16}/></button></div></div>
            <div className="thumbnail-strip">{content.slides.map((s, i) => <button key={i} className={`thumbnail ${i === selected ? 'chosen' : ''}`} onClick={() => setSelected(i)} aria-label={`Edit slide ${i + 1}`}><div className="thumb-canvas"><Slide slide={s} index={i} total={content.slides.length} company={companyName} jobPlan={jobPlan}/></div><span>{String(i + 1).padStart(2, '0')}</span></button>)}<button className="add-slide" aria-label="Add slide" disabled={content.slides.length >= 10 || !!companyName || !!jobPlan} onClick={() => { change({ ...content, slides: [...content.slides, { eyebrow: 'YOUR NEXT IDEA', title: 'Make it your own.', body: 'Add something worth sharing.', footer: 'Keep the conversation going.', theme: 'light' }] }); setSelected(content.slides.length); }}><Plus size={20}/></button></div>
            <div className="canvas-bottom"><span><i className="saved-dot"/>{saved ? 'All changes saved' : 'Editable draft'}</span><button className="text-button" disabled={!!busy} onClick={save}>{saved ? <Check size={14}/> : <Save size={14}/>}Save project</button></div>
          </section>
          <section className="editor card"><div className="card-heading"><span className="step">03</span><h2>Make it yours</h2></div><div className="editor-tabs"><span className="active">Content</span><span>Slide {String(selected + 1).padStart(2, '0')}</span></div>
            {!companyName && !isJobStory && <label>Eyebrow<input value={slide.eyebrow} maxLength={60} onChange={e => updateSlide({ eyebrow: e.target.value })}/></label>}
            <label>Headline<textarea className="headline-field" value={slide.title} maxLength={slide.companySection || slide.jobSection ? 90 : 120} onChange={e => updateSlide({ title: e.target.value })}/></label>
            <label>Body<textarea className="body-field" value={slide.body} maxLength={slide.jobSection ? 240 : slide.companySection ? 300 : 450} onChange={e => updateSlide({ body: e.target.value })}/></label>
            {!companyName && !isJobStory && <label>Footer<input value={slide.footer} maxLength={90} onChange={e => updateSlide({ footer: e.target.value })}/></label>}
            {slide.companySection && <><p className="workflow-guide">{companySectionLabels[slide.companySection]}</p>{slide.points?.map((point, index) => <div className="point-editor" key={index}><label>Point heading<input value={point.title} maxLength={60} onChange={e => updateSlide({ points: slide.points!.map((p, i) => i === index ? { ...p, title: e.target.value } : p) })}/></label><label>Supporting detail<textarea value={point.detail} maxLength={130} onChange={e => updateSlide({ points: slide.points!.map((p, i) => i === index ? { ...p, detail: e.target.value } : p) })}/></label></div>)}{['overview', 'product', 'founders'].includes(slide.companySection) && <div className={`company-media-card ${isCompanyCover ? 'logo-media' : ''}`}><strong>{slide.companySection === 'overview' ? 'Company logo · transparent PNG' : slide.companySection === 'product' ? 'Product screenshot' : 'Founders photo · blurred background'}</strong>{slide.image ? <><img src={slide.image.src} alt={slide.image.label}/>{slide.image.sourceUrl && <a href={slide.image.sourceUrl} target="_blank" rel="noreferrer">{slide.image.credit ?? 'View image source'} ↗</a>}</> : <p className="missing-media">Choose a real company image from Library or upload one.</p>}<button className="text-button" onClick={() => openPanel('library')}>{isCompanyCover ? 'Choose transparent PNG logo' : 'Choose / replace image'}</button>{isCompanyCover && <p className="logo-rule">Official logos only. PNG with a genuinely transparent background; no white box or baked-in checkerboard.</p>}{slide.companySection === 'founders' && <label>Background blur<input type="range" min="0" max="24" value={slide.imageBlur ?? 8} onChange={e => updateSlide({ imageBlur: Number(e.target.value) })}/></label>}</div>}</>}
            {slide.jobSection && <><p className="workflow-guide">{jobSectionLabels[slide.jobSection]}</p>{slide.points?.map((point, index) => <div className="point-editor" key={index}><label>Point heading<input value={point.title} maxLength={60} onChange={e => updateSlide({ points: slide.points!.map((p, i) => i === index ? { ...p, title: e.target.value } : p) })}/></label><label>Supporting detail<textarea value={point.detail} maxLength={130} onChange={e => updateSlide({ points: slide.points!.map((p, i) => i === index ? { ...p, detail: e.target.value } : p) })}/></label></div>)}{slide.jobSection === 'opportunity' && <div className="company-media-card logo-media"><strong>Company logo · transparent PNG</strong>{slide.companyLogo && <img src={slide.companyLogo.src} alt={slide.companyLogo.label}/>}<p>Use the official company logo with a transparent background.</p><button className="text-button" onClick={() => openPanel('library', 'companyLogo')}>Choose transparent PNG logo</button></div>}</>}
            {isCompanyCover && <div className="company-media-card"><strong>Cover visual</strong>{coverImage && <img src={coverImage.src} alt={coverImage.label}/>}<p>Use a product image or company photography to make the opening slide distinctive.</p><button className="text-button" onClick={() => openPanel('library', 'coverImage')}>Choose cover visual</button></div>}
            <label>Brand colors</label><div className="swatches">{brandThemes.map(theme => <button key={theme} className={`swatch ${theme} ${resolveTheme(slide.theme) === theme ? 'chosen' : ''}`} onClick={() => updateSlide({ theme })} aria-label={`${themeLabels[theme]} theme`} aria-pressed={resolveTheme(slide.theme) === theme}>{resolveTheme(slide.theme) === theme && <Check size={15}/>}</button>)}</div><p className="theme-name">{themeLabels[resolveTheme(slide.theme)]}</p>
            {!companyName && <label>Brand illustration<select value={slide.image ? 'custom' : slide.artwork ?? 'sage'} onChange={e => updateSlide({ image: undefined, artwork: e.target.value as SlideData['artwork'] })}>{slide.image && <option value="custom">{slide.image.label}</option>}{artworkOptions.filter(artwork => !isJobStory || artwork.id !== 'brand-mark').map(artwork => <option value={artwork.id} key={artwork.id}>{artwork.label}</option>)}</select></label>}
            {slide.cta && <div className="cta-editor"><label>Closing job title<input value={slide.cta.jobTitle} maxLength={120} onChange={e => updateSlide({ cta: { ...slide.cta!, jobTitle: e.target.value } })}/></label><label>Closing job link<input type="url" value={slide.cta.url} maxLength={1000} onChange={e => updateSlide({ cta: { ...slide.cta!, url: e.target.value } })}/></label><a href={slide.cta.url} target="_blank" rel="noreferrer">View supplied Saywise listing ↗</a></div>}
            <div className="rewrite-box"><label>Revision prompt · slide {selected + 1}<textarea value={instruction} maxLength={3000} onChange={e => updateSlide({ revisionPrompt: e.target.value })}/></label><button className="text-button" disabled={!!busy || !slide.title} onClick={() => perform('Rewriting slide', async () => { const next = await generate('rewriteSlide'); setPrevious(structuredClone(content)); updateSlide(next); })}><WandSparkles size={14}/>Revise this slide’s text<ArrowRight size={14}/></button></div>
            <button className="text-button" onClick={() => openPanel('image')}><ImageIcon size={14}/>Create / tweak this slide’s image<ArrowRight size={14}/></button>
            <button className="text-button" onClick={() => openPanel('library')}><FolderOpen size={14}/>{slide.reference ? `Reference: ${slide.reference.label}` : 'Choose a reference from Library'}</button>
            <button className="button secondary export-button" disabled={!!busy || !slide.title} onClick={() => perform('Exporting slide', exportPng)}><ArrowDownToLine size={16}/>Export slide PNG</button><button className="text-button print-button" disabled={!!busy} onClick={() => perform('Preparing image ZIP', exportAllPngs)}>Export all slides as ZIP<ArrowDownToLine size={13}/></button>{archive && <p className="zip-ready">{archive.count} PNG images · 1080 × 1350<br/><a href={archive.url} download="saywise-slides.zip">Download ZIP again</a></p>}
          </section>
        </div>
        <div className="below-grid"><section className="caption-card card"><div className="caption-heading"><h2>The words that go with it.</h2><button className="text-button" disabled={!!busy} onClick={() => perform('Writing caption', async () => { const result = await generate('generateCaption'); change({ ...content, ...result }); })}><Sparkles size={14}/>Refresh caption</button></div><textarea aria-label="Post caption" value={content.caption} maxLength={2400} onChange={e => change({ ...content, caption: e.target.value })}/><input aria-label="Hashtags" className="hashtags" value={content.hashtags.join(' ')} onChange={e => change({ ...content, hashtags: e.target.value.split(/\s+/).filter(Boolean).slice(0, 12).map(s => s.slice(0, 60)) })}/></section><section className="asset-card card"><img className="asset-sage" src={brandAssets.sage} alt=""/><h3>Your brand. Ready to create.</h3><p>Official Sage artwork and your exact colors, ready as image references.</p><button className="text-button" onClick={() => openPanel('image')}>Open image studio<ArrowUpRight size={14}/></button></section></div>
        {content.research && <details className="research-details card"><summary>Research & original brief · {content.research.sources.length} sources</summary><p>{content.research.summary}</p><p><strong>Original prompt:</strong> {content.context?.topic}</p>{content.research.sources.map(source => <article key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><p>{source.supports}</p></article>)}<small>Review source claims and publication dates before publishing. Research does not verify the supplied job listing is still open.</small></details>}
        <div className="status-line" role="status">{busy ? <><LoaderCircle size={14} className="spin"/>{busy}…</> : <><Check size={14}/>{notice}</>}</div>
      </main>
    </div>
    {panel && <div className="modal-backdrop" onClick={() => setPanel(null)}><section className={`modal ${panel === 'brand' || panel === 'library' ? 'brand-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={e => e.stopPropagation()}><button className="close-modal" aria-label="Close dialog" onClick={() => setPanel(null)}><X size={20}/></button><div className="overline">SAYWISE STUDIO</div><h2 id="dialog-title">{{ library: 'Your saved ideas.', brand: 'The Saywise brand kit.', research: 'Find your next conversation.', brief: 'A little direction.', image: 'Image studio.', usage: 'Generation usage.', help: 'From idea to something worth sharing.' }[panel]}</h2>
      {panel === 'brand' && <BrandLibrary onReference={chooseReference} onApply={applyImage}/> }
      {panel === 'library' && <><p>Projects are saved in your studio’s database.</p>{projects.length === 0 && <div className="empty-state">Your next good idea belongs here. Save your first project to get started.</div>}{projects.map(project => <button key={project.id} className="project-row" onClick={() => loadProject(project)}><FileText size={22}/><span>{project.content.title}<small>{project.content.slides.length} slides · {new Date(project.updatedAt).toLocaleDateString()}</small></span><ArrowRight size={18}/></button>)}<label className="upload-label"><Upload size={16}/>Import editable content JSON<input type="file" accept="application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void perform('Importing', async () => { const imported = carouselSchema.parse(JSON.parse(await file.text())); await validateLogos(imported); change(imported); setProjectId(crypto.randomUUID()); setSelected(0); setPanel(null); }); }}/></label></>}
      {panel === 'library' && <section className="image-library"><h3>Images & references · slide {selected + 1}</h3><p>{isLogoTarget ? 'Company logo: choose an official transparent PNG. Transparency is checked before applying.' : 'Choose an image as a visual reference, or place the original directly on this slide.'}</p><label className="upload-label"><Upload size={16}/>Add image to Library<input type="file" accept={isLogoTarget ? 'image/png' : 'image/png,image/jpeg,image/webp'} onChange={e => { const file = e.target.files?.[0]; if (file) void perform('Saving image', () => uploadImage(file)); }}/></label><div className="brand-asset-grid">{[...companyAssets, ...assets].map(asset => <article className="brand-asset" key={asset.src}><img className="library-image" src={asset.src} alt={asset.label}/><p>{asset.label}</p><small>{asset.provenance}</small>{asset.sourceUrl && <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Image source ↗</a>}<div><button className="text-button" onClick={() => chooseReference(asset)}>Use reference</button><button className="text-button" onClick={() => applyImage(asset)}>Use on slide</button></div></article>)}</div><h3>Official brand assets</h3><BrandLibrary onReference={chooseReference} onApply={applyImage}/></section>}
      {panel === 'research' && <><p>{status?.researchEnabled ? 'Explore source-backed angles. Review sources before calling something a trend.' : 'Topic inspiration, not verified trends. Live research is disabled in this workspace.'}</p><button className="button primary" disabled={!!busy} onClick={() => perform('Finding inspiration', async () => setTopics(await generate('recommendTrendingTopics')))}><Sparkles size={16}/>Find topic ideas</button>{topics?.topics.map((t, i) => <div className="topic-card" key={i}><small>{t.evidence === 'suggested' ? 'IDEA · NOT A VERIFIED TREND' : 'SOURCE-BACKED ANGLE'}</small><h3>{t.title}</h3><p>{t.angle}</p>{t.sources.filter(s => /^https?:\/\//.test(s.url)).map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>)}<button className="text-button" onClick={() => { setTopic(`${t.title}: ${t.angle}`); setPanel(null); }}>Use this idea<ArrowRight size={14}/></button></div>)}</>}
      {panel === 'brief' && brief && <><h3>{brief.title}</h3><p><strong>Audience</strong><br/>{brief.audience}</p><p><strong>Objective</strong><br/>{brief.objective}</p><ul>{brief.keyMessages.map((message, i) => <li key={i}>{message}</li>)}</ul><p><strong>Call to action</strong><br/>{brief.callToAction}</p><button className="button secondary" onClick={() => { setTopic(`${brief.title}. ${brief.objective}. ${brief.keyMessages.join('. ')}. ${brief.callToAction}`.slice(0, 2000)); setAudience(brief.audience.slice(0, 400)); setPanel(null); }}>Use this brief<ArrowRight size={14}/></button></>}
      {panel === 'image' && <><p>Illustration for slide {selected + 1}. Text, logo and layout stay editable on the canvas. {status?.imageMode === 'demo' ? 'Your current mode provides a saved illustration only; AI image generation and editing require OpenAI API mode.' : 'Describe a change to the current illustration, or create a new one from your reference.'}</p>
        <label>Image prompt · slide {selected + 1}<textarea value={slide.imagePrompt ?? ''} maxLength={2000} placeholder="e.g. Have Sage pointing to a laptop, with a mint background" onChange={e => updateSlide({ imagePrompt: e.target.value })}/></label>
        {slide.image && <label className="vector-toggle"><input type="checkbox" checked={editCurrent} onChange={e => setEditCurrent(e.target.checked)}/>Edit the current illustration (uncheck to create a fresh one)</label>}
        <button className="button secondary" onClick={() => openPanel('library')}><FolderOpen size={16}/>Choose reference from Library</button>
        <label>Quick brand reference<select value={imageReferences.some(ref => ref.src === slide.reference?.src) ? slide.reference!.src : slide.reference ? 'custom' : ''} onChange={e => { const ref = imageReferences.find(ref => ref.src === e.target.value); updateSlide({ reference: ref ? { src: ref.src, label: ref.label, provenance: 'brand' } : undefined }); }}>{slide.reference && !imageReferences.some(ref => ref.src === slide.reference?.src) && <option value="custom">{slide.reference.label}</option>}<option value="">No image reference</option>{imageReferences.map(ref => <option key={ref.id} value={ref.src}>{ref.label}</option>)}</select></label>
        {referencePreview && <div className="reference-preview"><img src={referencePreview} alt={slide.reference?.label}/><span>{slide.reference?.label}</span><button className="text-button" onClick={() => updateSlide({ reference: undefined })}>Remove reference</button></div>}
        <button className="button primary" disabled={!!busy} onClick={() => perform(status?.imageMode === 'demo' ? 'Loading demonstration' : 'Creating illustration', async () => { const result = await generate('generateIllustration'); const image = await api<LibraryImage>('assets', { dataUrl: result.dataUrl, label: `${result.provenance === 'demo' ? 'Demo' : 'Illustration'} · ${slide.title}`.slice(0, 200), provenance: result.provenance }); setIllustration(image); setAssets(existing => [image, ...existing]); })}><ImageIcon size={16}/>{status?.imageMode === 'demo' ? 'Show saved demonstration' : slide.image && editCurrent ? 'Revise this illustration' : 'Create illustration'}</button>
        {illustration && <div className="illustration-result"><p className="pill">{illustration.provenance === 'demo' ? 'SAVED DEMONSTRATION · NOT GENERATED' : illustration.provenance.toUpperCase()}</p><img src={illustration.src} alt={illustration.label}/><button className="button primary" onClick={() => applyImage(illustration)}>Apply to slide {selected + 1}</button><button className="text-button" onClick={() => download(illustration.src, 'saywise-illustration.png')}>Download illustration<ArrowDownToLine size={15}/></button><p>Saved to your image library. Apply it to continue revising this image.</p></div>}
      </>}
      {panel === 'usage' && <><p>Last 500 requests. Costs are estimates based on server-configured rates. “Unknown” means pricing or usage was unavailable; Codex subscription usage is separate from API billing.</p><div className="usage-table"><table><thead><tr><th>Operation</th><th>Tokens in / out</th><th>Images</th><th>Est. USD</th></tr></thead><tbody>{usage.map(row => <tr key={row.id}><td>{row.operation.replace('generate', '')}<small>{row.mode} · {row.status}</small></td><td>{row.inputTokens ?? '—'} / {row.outputTokens ?? '—'}</td><td>{row.images}</td><td>{row.estimatedCostUsd === null ? 'Unknown' : `$${row.estimatedCostUsd.toFixed(4)}`}</td></tr>)}</tbody></table>{!usage.length && <p>No generations yet.</p>}</div></>}
      {panel === 'help' && <><p>Choose an idea and format, create a draft, then edit every word and color. Save projects to your library or export editable JSON, slide PNGs, or all slides as a ZIP of numbered images.</p><p>Demo mode loads saved examples without credentials. Local Codex mode uses your CLI login for text. OpenAI API mode is configured on the server for production text and image generation.</p><p>Generation mode is a server setting. There’s no provider selector and no API key in your browser.</p></>}
      {busy && <p role="status" className="modal-progress"><LoaderCircle size={16} className="spin"/>{busy}…</p>}{error && <p className="modal-error" role="alert">{error}</p>}
    </section></div>}
    <div className="export-slides" ref={exportRef} aria-hidden="true" inert>{content.slides.map((s, i) => <Slide key={i} slide={s} index={i} total={content.slides.length} company={companyName} jobPlan={jobPlan}/>)}</div>
  </fieldset>;
}
