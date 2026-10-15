import { PRERENDERED_PAGES, PreRenderPageData } from './pages';

export function getPrerenderDataForPath(urlPath: string): PreRenderPageData | null {
  const clean = urlPath.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  if (clean === '/landing' || clean === '/') {
    return PRERENDERED_PAGES['/landing'] || null;
  }
  return PRERENDERED_PAGES[clean] || null;
}

export function injectPrerenderedHtml(rawTemplate: string, pageData: PreRenderPageData): string {
  let result = rawTemplate;

  // Replace <title>
  if (pageData.title) {
    result = result.replace(/<title>.*?<\/title>/i, `<title>${pageData.title}</title>`);
  }

  // Replace or inject meta description
  if (pageData.description) {
    if (result.includes('<meta name="description"')) {
      result = result.replace(
        /<meta name="description"[^>]*>/i,
        `<meta name="description" content="${pageData.description.replace(/"/g, '&quot;')}" />`
      );
    }
    if (result.includes('<meta property="og:description"')) {
      result = result.replace(
        /<meta property="og:description"[^>]*>/i,
        `<meta property="og:description" content="${pageData.description.replace(/"/g, '&quot;')}" />`
      );
    }
  }

  // Replace og:title
  if (pageData.title && result.includes('<meta property="og:title"')) {
    result = result.replace(
      /<meta property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${pageData.title.replace(/"/g, '&quot;')}" />`
    );
  }

  // Inject or update canonical link
  if (pageData.canonicalUrl) {
    if (result.includes('rel="canonical"')) {
      result = result.replace(
        /<link rel="canonical"[^>]*>/i,
        `<link rel="canonical" href="${pageData.canonicalUrl}" />`
      );
    } else {
      result = result.replace(
        /<\/head>/i,
        `    <link rel="canonical" href="${pageData.canonicalUrl}" />\n  </head>`
      );
    }
  }

  // Inject prerendered HTML inside <div id="app"></div>
  result = result.replace(
    /<div id="app">\s*<\/div>/i,
    `<div id="app">${pageData.htmlContent}</div>`
  );

  return result;
}
