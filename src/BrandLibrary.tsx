import { useState } from 'react';
import { ArrowDownToLine, ArrowRight } from 'lucide-react';
import inventory from '../public/brand/saywise/manifest.json';
import { brandBase, brandColors } from '../shared/brand';
import type { LibraryImage } from '../shared/content';

const categories = [ ['sage/', 'Sage illustrations'], ['logo/', 'Logos'], ['banners/', 'Banners'], ['icons/', 'Icons'], ['colors/', 'Palette'] ] as const;
export function BrandLibrary({ onReference, onApply }: { onReference: (image: LibraryImage) => void; onApply?: (image: LibraryImage) => void }) {
  const [category, setCategory] = useState<string>('sage/');
  const [vectors, setVectors] = useState(false);
  const assets = inventory.assets.filter(asset => asset.path.startsWith(category) && (vectors ? asset.path.endsWith('.svg') : /\.(png|jpg|webp)$/.test(asset.path)) && !asset.path.includes('source-raster'));
  return <>
    <p className="brand-library-intro">127 original files from your Saywise brand kit, preserved locally. Use the official logo files and Sage illustrations directly, or select a visual reference in Image Studio.</p>
    <div className="palette-grid">{Object.entries(brandColors).map(([name, hex]) => <div className="palette-chip" key={name}><i style={{ background: hex }}/><span>{name}<small>{hex}</small></span></div>)}</div>
    <p className="brand-type">Geist Sans <span>Local font · official SVG wordmarks · mint → blue gradient</span></p>
    <div className="brand-categories" aria-label="Asset categories">{categories.map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}</div>
    <label className="vector-toggle"><input type="checkbox" checked={vectors} onChange={event => setVectors(event.target.checked)}/>Show SVG source files</label>
    <div className="brand-asset-grid">{assets.map(asset => {
      const url = `${brandBase}/${asset.path}`;
      const reference: LibraryImage = { src: url, label: asset.path.split('/').at(-1)!, provenance: 'brand' };
      return <article className="brand-asset" key={asset.path}>
        <a className={`brand-asset-preview ${asset.path.includes('white') ? 'on-dark' : ''}`} href={url} target="_blank" rel="noreferrer"><img src={url} loading="lazy" alt={asset.path.split('/').at(-1)?.replace(/[-.]/g, ' ')}/></a>
        <p>{asset.path.split('/').at(-1)}</p>
        <div><a href={url} download className="text-button"><ArrowDownToLine size={13}/>Download</a>{!vectors && <button className="text-button" onClick={() => onReference(reference)}>Use reference<ArrowRight size={13}/></button>}{onApply && <button className="text-button" onClick={() => onApply(reference)}>Use on slide</button>}</div>
      </article>;
    })}</div>
    {!assets.length && <p className="empty-state">No SVG files in this category. Switch off “Show SVG source files” to see the originals.</p>}
    {category === 'banners/' && <p className="photo-credit">Photo credit supplied with the kit: “Golden hour and cloud” by Jason W, Unsplash. <a href={`${brandBase}/banners/photo/PHOTO-CREDIT.txt`} target="_blank" rel="noreferrer">View original credit</a>.</p>}
  </>;
}
