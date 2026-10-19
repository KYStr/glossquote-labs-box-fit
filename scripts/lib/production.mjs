import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, PUBLIC_FILES, assertTree, manifestOf, sha256 } from './files.mjs';
import { checkSource } from './check-source.mjs';
import { parseHeaders, applyHeaders } from './headers.mjs';
import { parseRobots, robotsAllowed } from './robots.mjs';
import { BASE_CSP, META_CSP } from './csp.mjs';

export const ORIGIN = 'https://boxfit.glossquote.com';
export const PRODUCTION_FILES = Object.freeze([...PUBLIC_FILES, '_headers', '_redirects', 'sitemap.xml'].sort());
export const CANONICALS = Object.freeze(['/index.html', '/en/index.html']);
export const REDIRECTS = Object.freeze({ '/': `${ORIGIN}/index.html`, '/en': `${ORIGIN}/en/index.html`, '/en/': `${ORIGIN}/en/index.html` });
const baseCsp = BASE_CSP;
export const inlineHash = body => createHash('sha256').update(body).digest('base64');

export async function verifyM1Assets(source) {
  const baseline = JSON.parse(await readFile(join(ROOT, 'release/m1-public-hashes.json'), 'utf8'));
  // Keep the frozen M1 manifest. Undo only the reviewed R2 favicon/CSP head change.
  const original = new Map(source);
  assert.ok(original.delete('favicon.svg'), 'R2 local favicon is required.');
  for (const file of ['index.html', 'en/index.html']) {
    let html = original.get(file).toString('utf8');
    const meta = `  <meta http-equiv="Content-Security-Policy" content="${META_CSP}">`;
    const icon = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">';
    assert.equal(html.split(meta).length, 2, 'Exactly one R2 meta policy is required.');
    assert.equal(html.split(icon).length, 2, 'Exactly one R2 favicon link is required.');
    assert.ok(html.includes(meta + '\r\n') || html.includes(meta + '\n'));
    html = html.replace(meta + (html.includes(meta + '\r\n') ? '\r\n' : '\n'), '').replace(icon, '<link rel="icon" href="data:,">');
    original.set(file, Buffer.from(html));
  }
  assert.deepEqual(manifestOf(original), baseline, 'M1 public bytes outside the reviewed R2 favicon/CSP correction must remain unchanged.');
}

export async function checkWrangler() {
  const configuration = JSON.parse(await readFile(join(ROOT, 'wrangler.jsonc'), 'utf8'));
  assert.deepEqual(configuration, {
    name: 'glossquote-box-fit', compatibility_date: '2026-10-18',
    assets: { directory: './dist-production', not_found_handling: '404-page', html_handling: 'none' },
    routes: [{ pattern: 'boxfit.glossquote.com', custom_domain: true }],
    workers_dev: false, preview_urls: false, send_metrics: false,
    observability: { enabled: false, logs: { enabled: false }, traces: { enabled: false } },
  });
}

export async function createProductionFiles() {
  const source = await checkSource();
  await verifyM1Assets(source);
  await checkWrangler();
  const output = new Map([...source].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const hashes = new Map();
  for (const [index, path] of CANONICALS.entries()) {
    const original = source.get(path.slice(1)).toString('utf8');
    const title = /<title>([^<]+)<\/title>/.exec(original)[1];
    const description = /<meta name="description" content="([^"]+)">/.exec(original)[1];
    const language = index === 0 ? 'zh-Hant' : 'en';
    const data = { '@context': 'https://schema.org', '@type': 'WebApplication', name: /<h1>([^<]+)<\/h1>/.exec(original)[1], description, url: ORIGIN + path, inLanguage: language, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript', isAccessibleForFree: true };
    const json = JSON.stringify(data).replaceAll('<', '\\u003c');
    const metadata = `  <link rel="canonical" href="${ORIGIN}${path}">\n` +
      `  <link rel="alternate" hreflang="zh-Hant" href="${ORIGIN}/index.html">\n` +
      `  <link rel="alternate" hreflang="en" href="${ORIGIN}/en/index.html">\n` +
      `  <link rel="alternate" hreflang="x-default" href="${ORIGIN}/index.html">\n` +
      `  <meta property="og:type" content="website">\n` +
      `  <meta property="og:title" content="${title}">\n` +
      `  <meta property="og:description" content="${description}">\n` +
      `  <meta property="og:url" content="${ORIGIN}${path}">\n` +
      `  <meta property="og:locale" content="${index === 0 ? 'zh_TW' : 'en_US'}">\n` +
      `  <script type="application/ld+json">${json}</script>\n`;
    const metaPolicy = META_CSP.replace("script-src 'self'", `script-src 'self' 'sha256-${inlineHash(json)}'`);
    const html = original.replace(`<meta http-equiv="Content-Security-Policy" content="${META_CSP}">`, `<meta http-equiv="Content-Security-Policy" content="${metaPolicy}">`).replace('<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">').replace('</head>', metadata + '</head>');
    assert.equal(html.slice(html.indexOf('<body>')), original.slice(original.indexOf('<body>')), 'Production must preserve the M1 task canvas.');
    output.set(path.slice(1), Buffer.from(html));
    hashes.set(path, inlineHash(json));
  }
  let headers = `/*\n  Content-Security-Policy: ${baseCsp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  X-Robots-Tag: noindex,nofollow\n  Cache-Control: no-cache\n`;
  for (const path of CANONICALS) {
    headers += `\n${path}\n  ! X-Robots-Tag\n  X-Robots-Tag: index,follow\n  ! Content-Security-Policy\n  Content-Security-Policy: ${baseCsp.replace("script-src 'self'", `script-src 'self' 'sha256-${hashes.get(path)}'`)}\n`;
  }
  output.set('_headers', Buffer.from(headers));
  output.set('_redirects', Buffer.from(Object.entries(REDIRECTS).map(([from, to]) => `${from} ${to} 301`).join('\n') + '\n'));
  const allowed = ['/', '/en', '/en/', ...CANONICALS, '/favicon.svg', '/css/app.css', '/js/app.js', '/js/bootstrap.js', '/js/core/calculate-box-fit.js', '/robots.txt', '/sitemap.xml'];
  output.set('robots.txt', Buffer.from('User-agent: *\nDisallow: /\n' + allowed.map(path => `Allow: ${path}$`).join('\n') + `\nSitemap: ${ORIGIN}/sitemap.xml\n`));
  output.set('sitemap.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${CANONICALS.map(path => `  <url><loc>${ORIGIN}${path}</loc></url>`).join('\n')}\n</urlset>\n`));
  return new Map([...output].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function productionManifest(files) {
  return { schemaVersion: 1, mode: 'production', origin: ORIGIN, files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })) };
}

export function validateProduction(files) {
  assert.deepEqual([...files.keys()].sort(), [...PRODUCTION_FILES]);
  const rules = parseHeaders(files.get('_headers').toString());
  const robots = parseRobots(files.get('robots.txt').toString());
  for (const [index, path] of CANONICALS.entries()) {
    const html = files.get(path.slice(1)).toString();
    assert.equal([...html.matchAll(/<link rel="canonical"/g)].length, 1);
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}${path}">`));
    assert.equal([...html.matchAll(/hreflang=/g)].length, 3);
    for (const [lang, href] of [['zh-Hant', '/index.html'], ['en', '/en/index.html'], ['x-default', '/index.html']]) assert.ok(html.includes(`hreflang="${lang}" href="${ORIGIN}${href}"`));
    assert.match(html, /<meta name="robots" content="index,follow">/);
    const headers = applyHeaders(rules, path);
    assert.equal(headers['x-robots-tag'], 'index,follow');
    assert.doesNotMatch(headers['content-security-policy'], /unsafe-inline|unsafe-eval/);
    assert.equal(headers['content-security-policy'].split('; ').find(rule => rule.startsWith('img-src ')), "img-src 'self'");
    const jsonBodies = [...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(match => match[1]);
    assert.equal(jsonBodies.length, 1);
    const data = JSON.parse(jsonBodies[0]);
    assert.equal(data['@type'], 'WebApplication');
    assert.equal(data.url, ORIGIN + path);
    assert.equal(data.inLanguage, index === 0 ? 'zh-Hant' : 'en');
    assert.ok(headers['content-security-policy'].includes(`'sha256-${inlineHash(jsonBodies[0])}'`));
    assert.equal([...headers['content-security-policy'].matchAll(/sha256-/g)].length, 1);
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    assert.ok(meta);
    assert.equal(meta[1], headers['content-security-policy'].replace("; frame-ancestors 'none'", ''));
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
    assert.ok(files.has('favicon.svg'));
    assert.equal(robotsAllowed(robots, '/favicon.svg'), true);
    for (const match of html.matchAll(/(?:src|href)="(\/(?:css|js)\/[^"?#]+)"/g)) {
      assert.ok(files.has(match[1].slice(1)), 'Referenced static asset must exist.');
      assert.equal(robotsAllowed(robots, match[1]), true, 'Robots must allow every actual script and stylesheet.');
    }
    assert.equal(robotsAllowed(robots, path), true);
  }
  assert.equal(robotsAllowed(robots, '/js/core/calculate-box-fit.js'), true);
  for (const path of ['/scripts/build.mjs', '/docs/TECHNICAL.md', '/package.json', '/.git/config', '/test/core.test.mjs', '/.runs/private', '/CSS/app.css', '/JS/app.js', '/404.html', '/manifest.json']) assert.equal(robotsAllowed(robots, path), false);
  assert.deepEqual([...files.get('sitemap.xml').toString().matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), CANONICALS.map(path => ORIGIN + path));
  assert.equal(applyHeaders(rules, '/404.html')['x-robots-tag'], 'noindex,nofollow');
  assert.match(files.get('404.html').toString(), /noindex,nofollow/);
  assert.doesNotMatch(files.get('404.html').toString(), /id="calculator"/);
  return { canonicalPages: 2, jsonLdHashes: 2, staticFiles: files.size, robotsActualAssets: 'PASS' };
}

export async function verifyProductionBuild(directory = join(ROOT, 'dist-production')) {
  const expected = await createProductionFiles();
  validateProduction(expected);
  const paths = await assertTree(directory, PRODUCTION_FILES);
  assert.equal(paths.length, PRODUCTION_FILES.length);
  const manifestPath = `${directory}.manifest.json`;
  const manifestStat = await lstat(manifestPath);
  assert.ok(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.nlink === 1, 'Unsafe production manifest file.');
  const actualManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(actualManifest, productionManifest(expected), 'Production manifest is stale.');
  const actual = new Map();
  for (const path of expected.keys()) actual.set(path, await readFile(join(directory, path)));
  assert.deepEqual(productionManifest(actual), productionManifest(expected), 'Production bytes differ from the deterministic build.');
  return actual;
}
