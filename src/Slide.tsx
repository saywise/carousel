import type { ContentPlan, Slide as SlideData } from '../shared/content';
import { artworkOptions, brandAssets, resolveTheme } from '../shared/brand';
import { generalizeRole } from '../shared/jobs';
import { mediaForCompany } from '../shared/company';
export function Slide({ slide, index, total, company, jobPlan }: { slide: SlideData; index: number; total: number; company?: string; jobPlan?: Extract<ContentPlan, { type: 'job' }> }) {
  const theme = resolveTheme(slide.theme);
  const artwork = artworkOptions.find(option => option.id === (slide.artwork ?? 'sage'))!;
  const compact = slide.title.length + slide.body.length >= 320;
  if (jobPlan && slide.jobSection) {
    const section = slide.jobSection;
    const role = jobPlan.role ?? generalizeRole(jobPlan.jobTitle);
    const closing = section === 'opportunity';
    const dense = slide.title.length + slide.body.length + (slide.points ?? []).reduce((n, point) => n + point.title.length + point.detail.length, 0) > 540;
    const media = jobPlan.company ? mediaForCompany(jobPlan.company) : undefined;
    const logo = theme === 'dark' && slide.companyLogo?.src === media?.logo.src ? media?.logoWhite : slide.companyLogo;
    // The wordmark/icon is reserved for the opportunity slide, even if selected as artwork.
    const illustration = slide.image ?? (artwork.id !== 'none' && artwork.id !== 'brand-mark' ? { src: artwork.src, label: '' } : undefined);
    return <article className={`slide job-slide job-${section} theme-${theme} ${dense ? 'job-dense' : ''} ${illustration ? 'job-has-image' : ''}`}>
      <header className="job-header">Job Explainer · {role}</header>
      <div className="job-copy"><h2 style={{ fontSize: section === 'hook' ? (slide.title.length > 65 ? 39 : 49) : slide.title.length > 65 ? 32 : undefined }}>{slide.title}</h2>{slide.body && <p className="slide-body">{slide.body}</p>}</div>
      {!!slide.points?.length && <div className="job-points">{slide.points.map((point, i) => <div className="job-point" key={i}><span aria-hidden="true" className="job-point-symbol">{section === 'skills' ? ['✦', '↗', '◎'][i] : ['◎', '↗', '✦'][i]}</span><div><strong>{point.title}</strong><p>{point.detail}</p></div></div>)}</div>}
      {(section === 'hook' || section === 'shift') && <div className="job-visual"><div className="job-orbit"/><div className="job-visual-card" aria-hidden="true"><span>↗</span><i/><i/><i/></div>{illustration && <img src={illustration.src} alt={illustration.label}/>}</div>}
      {(section === 'work' || section === 'skills') && illustration && <img className="job-support-image" src={illustration.src} alt={illustration.label}/>}
      {closing && <div className="job-opportunity"><div className="job-employer">{logo && <img src={logo.src} alt={logo.label}/>}<span>{jobPlan.company}</span></div>{slide.cta && <a className="job-listing-link" href={slide.cta.url} target="_blank" rel="noreferrer"><strong>{slide.cta.jobTitle}</strong><span>View this role on Saywise ↗</span><small>{slide.cta.url}</small></a>}{illustration && <img className="job-closing-image" src={illustration.src} alt={illustration.label}/>}<div className="job-signoff"><p>Explore this role and more opportunities on Saywise.</p><img className="slide-logo" src={theme === 'dark' ? brandAssets.logoWhite : brandAssets.logoBlack} alt="Saywise"/></div></div>}
    </article>;
  }
  if (company) {
    const section = slide.companySection ?? (index === total - 1 ? 'opportunity' : 'overview');
    const closing = index === total - 1;
    const media = mediaForCompany(company);
    const coverLogo = theme === 'dark' && slide.image?.src === media?.logo.src ? media?.logoWhite : slide.image;
    const coverImage = slide.coverImage ?? mediaForCompany(company)?.product;
    const dense = slide.title.length + slide.body.length + (slide.points ?? []).reduce((length, point) => length + point.title.length + point.detail.length, 0) > 380 || (section === 'founders' && !!slide.points?.length);
    return <article className={`slide company-slide company-${section} theme-${theme} ${dense ? 'company-dense' : ''} ${section === 'overview' && slide.title.length <= 40 && slide.title.length + slide.body.length <= 210 ? 'company-cover-short' : ''} ${section === 'founders' && slide.image ? 'has-founder-photo' : ''}`}>
      {section === 'founders' && slide.image && <><img className="founder-background" src={slide.image.src} style={{ filter: `blur(${slide.imageBlur ?? 8}px)` }} alt={slide.image.label}/><div className="founder-shade"/></>}
      <header className="company-header"><span>Company Spotlight · {company}</span></header>
      {section === 'overview' && coverLogo && <div className="company-logo-box"><img src={coverLogo.src} alt={coverLogo.label}/></div>}
      <div className="company-copy"><h2 style={section === 'overview' ? { fontSize: slide.title.length > 65 ? 38 : 46 } : undefined}>{slide.title}</h2>{slide.body && <p className="slide-body">{slide.body}</p>}</div>
      {section === 'overview' && <div className={`company-cover-visual ${coverImage ? 'with-product' : ''}`}><div className="cover-orbit"/><div className="cover-orbit orbit-two"/>{coverImage && <div className="cover-product"><img src={coverImage.src} alt={coverImage.label}/></div>}<span className="cover-arrow" aria-hidden="true">↗</span></div>}
      {section === 'product' && slide.image && <div className="product-picture"><img src={slide.image.src} alt={slide.image.label}/></div>}
      {!!slide.points?.length && <div className={`company-points points-${section}`}>{slide.points.map((point, i) => <div className="company-point" key={i}><strong>{point.title}</strong><p>{point.detail}</p></div>)}</div>}
      {closing && <div className="company-closing">{slide.cta && <a className="company-job-link" href={slide.cta.url} target="_blank" rel="noreferrer"><strong>{slide.cta.jobTitle} ↗</strong><span>{slide.cta.url}</span></a>}<p>Explore this role and more opportunities on Saywise.</p><img className="slide-logo" src={theme === 'dark' ? brandAssets.logoWhite : brandAssets.logoBlack} alt="Saywise"/></div>}
    </article>;
  }
  return <article className={`slide theme-${theme}`}>
    <header><img className="slide-logo" src={theme === 'dark' ? brandAssets.logoWhite : brandAssets.logoBlack} alt="Saywise"/><span className="slide-series">Ideas worth sharing.</span></header>
    <div className="slide-copy"><p className="eyebrow">{slide.eyebrow}</p><h2 style={{ fontSize: slide.title.length > 75 ? 32 : 43 }}>{slide.title}</h2><p className="slide-body" style={{ fontSize: slide.body.length > 220 ? 12 : 15 }}>{slide.body}</p></div>
    {slide.cta && <a className="slide-cta" href={slide.cta.url} target="_blank" rel="noreferrer"><strong>{slide.cta.jobTitle} on Saywise ↗</strong><span>{slide.cta.url}</span></a>}
    {(slide.image || artwork.id !== 'none') && <img className={`slide-illustration ${compact || slide.cta ? 'compact' : ''} ${!slide.image && artwork.id === 'brand-mark' ? 'brand-mark' : ''}`} src={slide.image?.src ?? (artwork.id === 'brand-mark' ? (theme === 'dark' ? brandAssets.iconWhite : brandAssets.iconBlack) : artwork.src)} alt={slide.image?.label ?? ''}/ >}
    <footer><span>{slide.footer}</span><span>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} ↗</span></footer>
  </article>;
}
