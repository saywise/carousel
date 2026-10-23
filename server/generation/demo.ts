import { demoCarousel } from '../../shared/demo';
import { jobSections, companySections, type GenerationInput, type Operation } from '../../shared/content';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function demoOutput(operation: Operation, _input: GenerationInput): unknown {
  if (operation === 'generateCarousel' && _input.plan?.type === 'company') {
    const point = (title: string) => ({ title, detail: 'Demonstration placeholder. Replace with verified, dated research.' });
    return {
      title: `${_input.plan.company} · demonstration`,
      slides: Object.fromEntries([
        { eyebrow: '', title: _input.plan.company, body: 'What does this company do? Live generation researches its product, customers and purpose.', footer: '', theme: 'mint', points: [] },
        { eyebrow: '', title: 'The product, in three strengths.', body: 'Demonstration only. These strengths have not been researched.', footer: '', theme: 'light', points: [point('Strength one'), point('Strength two'), point('Strength three')] },
        { eyebrow: '', title: 'Meet the founders.', body: 'Live generation verifies the founders, their story and current roles. Add a sourced founders photo from the Library.', footer: '', theme: 'dark', points: [] },
        { eyebrow: '', title: 'Growth, backing and the work ahead.', body: '', footer: '', theme: 'blue', points: [point('Growth · unverified'), point('Backing · unverified'), point('Why join · editorial')] },
        { eyebrow: '', title: _input.plan.jobTitle, body: 'Explore the provided job and more opportunities on Saywise. Check the listing for current availability.', footer: '', theme: 'dark', points: [] },
      ].map((slide, index) => [companySections[index], slide])),
      caption: 'DEMONSTRATION ONLY. No current company facts, growth or backing verified.', hashtags: ['#Saywise'],
      research: { summary: 'Saved demonstration. No live research performed.', sources: [] },
    };
  }
  if (operation === 'generateCarousel' && _input.plan?.type === 'job') {
    const role = _input.plan.role ?? _input.plan.jobTitle;
    const pm = role === 'Product Manager';
    const point = (title: string, detail: string) => ({ title, detail });
    const slides = [
      { title: `What does a ${role} actually do?`.slice(0, 90), body: pm ? 'Decide what’s worth building—and help a team build it.' : `Get inside the work, the skills and what’s changing for a ${role}.`.slice(0, 240), theme: 'mint', points: [] },
      { title: 'Inside the work.', body: 'Illustrative examples · verify with live research.', theme: 'light', points: pm ? [point('Understand the problem', 'Talk to customers to find out where they get stuck.'), point('Choose what matters', 'Weigh customer value, effort and business goals to set priorities.'), point('Build with the team', 'Work with design and engineering to test ideas and learn from releases.')] : [point('Understand the need', 'Replace with a researched responsibility and a concrete example.'), point('Make decisions', 'Replace with a typical decision someone in this role makes.'), point('Deliver the work', 'Replace with a verified example of the role’s output.')] },
      { title: 'What’s changing in the role?', body: 'Demonstration placeholder. Live generation researches one current shift and explains what it means for the work. No trend has been verified here.', theme: 'dark', points: [] },
      { title: 'What makes someone good at it?', body: 'Broad role skills · illustrative, not hiring requirements.', theme: 'blue', points: pm ? [point('Product judgment', 'Choose which customer problem deserves the team’s time.'), point('Clear communication', 'Explain the goal and tradeoffs so the team can make decisions together.'), point('Learning from evidence', 'Use interviews and product data to test whether a change helped.')] : [point('Core craft', 'Replace with a researched skill and an observable example.'), point('Working with others', 'Explain how this skill shows up in the role’s actual work.'), point('Sound judgment', 'Show a concrete decision this skill helps someone make.')] },
      { title: 'Put those skills to work.', body: `${_input.plan.company ?? 'Explore the linked opportunity'}. Check the listing for current details and availability.`, theme: 'mist', points: [] },
    ];
    return { title: `${role} · Job Explainer demonstration`, slides: Object.fromEntries(slides.map((slide, index) => [jobSections[index], { ...slide, eyebrow: '', footer: '' }])), caption: 'DEMONSTRATION ONLY. Illustrative role content; no live research or current trend verified.', hashtags: ['#Saywise'], research: { summary: 'Saved demonstration. Role examples are illustrative; no live research performed.', sources: [] } };
  }
  if (operation === 'rewriteSlide' && _input.slide?.jobSection) return { ..._input.slide, points: _input.slide.points ?? [] };
  if (operation === 'rewriteSlide' && _input.slide?.companySection) return { ..._input.slide, points: _input.slide.points ?? [] };
  if ((operation === 'generateCarousel' || operation === 'generateStaticPost') && _input.plan && _input.plan.type !== 'general') {
    const company = _input.plan.type === 'company' ? _input.plan.company : _input.plan.role ?? _input.plan.jobTitle;
    const slides = [
      { eyebrow: `DEMO · ${_input.plan.type.toUpperCase()} POST`, title: company, body: 'Demonstration layout. Live research has not been performed.', footer: 'Replace with verified information.', theme: 'mint' },
      { eyebrow: 'DEMO · RESEARCH PLACEHOLDER', title: _input.plan.type === 'company' ? 'What makes this company interesting?' : 'What is changing in this role?', body: 'In live mode, this section contains researched facts and interesting angles with sources you can review.', footer: 'No trend claims verified.', theme: 'light' },
      { eyebrow: 'DEMO · RESEARCH PLACEHOLDER', title: _input.plan.type === 'company' ? 'A closer look at the work.' : 'Skills worth building.', body: 'Add sourced insights here. This saved example makes no claims about the company or specific listing.', footer: 'Always review the sources.', theme: 'blue' },
      { eyebrow: 'YOUR NEXT STEP', title: _input.plan.jobTitle, body: 'Explore the user-provided opportunity on Saywise.', footer: 'See the listing for current details.', theme: 'dark' },
    ];
    return { title: `${company} · demonstration`, slides: operation === 'generateStaticPost' ? [slides[0]] : slides, caption: 'DEMONSTRATION ONLY. Research placeholders; no current company facts, trends or job requirements verified.', hashtags: ['#Saywise'], research: { summary: 'Saved demonstration. No live research performed.', sources: [] } };
  }
  switch (operation) {
    case 'generateCarousel': return { ...structuredClone(demoCarousel), research: { summary: 'Saved example; no live research.', sources: [] } };
    case 'generateStaticPost': return { ...structuredClone(demoCarousel), slides: [structuredClone(demoCarousel.slides[0])], research: { summary: 'Saved example; no live research.', sources: [] } };
    case 'rewriteSlide': return { ...demoCarousel.slides[1], title: 'Curiosity starts\nwith listening.' };
    case 'generateCaption': return { caption: demoCarousel.caption, hashtags: demoCarousel.hashtags };
    case 'generateContentBrief': return { title: demoCarousel.title, audience: 'Curious professionals', objective: 'Encourage more thoughtful conversations', keyMessages: ['Listen before responding', 'Ask one more question'], callToAction: 'Try one better question today' };
    case 'recommendTrendingTopics': return { topics: [ { title: 'The art of the follow-up question', angle: 'Three questions that make space for a better conversation.', evidence: 'suggested', sources: [] }, { title: 'Listening in a distracted world', angle: 'A practical reset for your next meeting.', evidence: 'suggested', sources: [] } ] };
    case 'generateIllustration': return { dataUrl: 'data:image/png;base64,' + readFileSync(resolve(process.env.NODE_ENV === 'production' ? 'dist/client' : 'public', 'brand/saywise/sage/png/sage-upper-body.png')).toString('base64'), alt: 'Saved brand-kit illustration: Sage holding binoculars. No AI generation performed.', provenance: 'demo' };
  }
}
