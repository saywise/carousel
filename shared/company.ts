import type { LibraryImage } from './content';

// Original company-supplied press images; no AI recreations of products or people.
export const companyMedia: Record<string, { logo: LibraryImage; logoWhite: LibraryImage; product: LibraryImage; founders: LibraryImage }> = {
  brex: {
    logo: { src: '/company/brex/logo.png', label: 'Brex · official logo', provenance: 'company', sourceUrl: 'https://www.brex.com/journal/press', credit: 'Brex official press kit' },
    logoWhite: { src: '/company/brex/logo-white.png', label: 'Brex · official white logo', provenance: 'company', sourceUrl: 'https://www.brex.com/journal/press', credit: 'Brex official press kit' },
    product: { src: '/company/brex/product.png', label: 'Brex · product screenshot', provenance: 'company', sourceUrl: 'https://www.brex.com/journal/press', credit: 'Brex official press kit' },
    founders: { src: '/company/brex/founders.jpg', label: 'Brex · Pedro Franceschi and Henrique Dubugras', provenance: 'company', sourceUrl: 'https://www.brex.com/journal/press', credit: 'Brex official press kit' },
  },
};
export function mediaForCompany(company: string) { return companyMedia[company.trim().toLowerCase()]; }
export const companySectionLabels = { overview: 'What the company does', product: 'Product · three strengths', founders: 'Meet the founders', growth: 'Growth, backing & why join', opportunity: 'The Saywise opportunity' };
