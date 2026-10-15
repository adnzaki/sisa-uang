import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRERENDERED_PAGES } from '../src/prerender/pages';
import { injectPrerenderedHtml } from '../src/prerender/injector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

function runPrerender() {
  if (!fs.existsSync(indexHtmlPath)) {
    console.error(`[Pre-render] dist/index.html not found. Run "vite build" first.`);
    process.exit(1);
  }

  const baseTemplate = fs.readFileSync(indexHtmlPath, 'utf8');
  console.log(`[Pre-render] Generating static HTML for public & legal pages...`);

  for (const [routePath, pageData] of Object.entries(PRERENDERED_PAGES)) {
    const routeFolder = path.join(distDir, routePath.replace(/^\//, ''));
    if (!fs.existsSync(routeFolder)) {
      fs.mkdirSync(routeFolder, { recursive: true });
    }

    const outputHtml = injectPrerenderedHtml(baseTemplate, pageData);
    const targetFile = path.join(routeFolder, 'index.html');
    fs.writeFileSync(targetFile, outputHtml, 'utf8');
    console.log(`✓ Pre-rendered: ${routePath} -> dist/${routePath.replace(/^\//, '')}/index.html (${Math.round(outputHtml.length / 1024)} KB)`);
  }

  console.log(`[Pre-render] All public pages successfully pre-rendered into static HTML.`);
}

runPrerender();
