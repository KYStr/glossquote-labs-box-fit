import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, link } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { ROOT, loadPublic, sha256 } from '../scripts/lib/files.mjs';
import { createProductionFiles, validateProduction, verifyProductionBuild, productionManifest, verifyM1Assets } from '../scripts/lib/production.mjs';
import { parseHeaders, applyHeaders } from '../scripts/lib/headers.mjs';
import { parseRobots, robotsAllowed } from '../scripts/lib/robots.mjs';
import { checkProductionHttp } from '../scripts/lib/release-http.mjs';
import { parseRedirects } from '../scripts/lib/production-server.mjs';
import { createHash } from 'node:crypto';

test('M2: frozen M1 source bytes remain exactly unchanged', async () => {
  const source = await loadPublic();
  await verifyM1Assets(source);
  assert.equal(source.size, 8);
  const altered = new Map(source);
  altered.set('js/app.js', Buffer.from('unreviewed change'));
  await assert.rejects(verifyM1Assets(altered), /M1 public bytes/);
});

test('M2: canonical, reciprocal languages, matching OG and exact JSON-LD hashes', async () => {
  const files = await createProductionFiles();
  assert.deepEqual(validateProduction(files), { canonicalPages: 2, jsonLdHashes: 2, staticFiles: 11, robotsActualAssets: 'PASS' });
  const headers = parseHeaders(files.get('_headers').toString());
  for (const [path, lang, name] of [
    ['/index.html', 'zh-Hant', '箱內排列容量試算'],
    ['/en/index.html', 'en', 'Box Grid Capacity Calculator'],
  ]) {
    const html = files.get(path.slice(1)).toString();
    assert.match(html, /<meta name="robots" content="index,follow">/);
    assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1);
    assert.ok(html.includes(`rel="canonical" href="https://boxfit.glossquote.com${path}"`));
    for (const [language, canonical] of [['zh-Hant', '/index.html'], ['en', '/en/index.html'], ['x-default', '/index.html']]) assert.ok(html.includes(`hreflang="${language}" href="https://boxfit.glossquote.com${canonical}"`));
    const json = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html)[1];
    const data = JSON.parse(json);
    assert.equal(data.name, name);
    assert.equal(data.inLanguage, lang);
    assert.equal(data.url, 'https://boxfit.glossquote.com' + path);
    assert.equal(data['@context'], 'https://schema.org');
    assert.equal(data['@type'], 'WebApplication');
    const independentHash = createHash('sha256').update(Buffer.from(json, 'utf8')).digest('base64');
    const actual = applyHeaders(headers, path);
    assert.ok(actual['content-security-policy'].includes(`'sha256-${independentHash}'`));
    assert.equal(actual['x-robots-tag'], 'index,follow');
    assert.equal(actual['content-security-policy'].split('default-src').length, 2);
    assert.ok(html.includes(`property="og:url" content="https://boxfit.glossquote.com${path}"`));
    assert.ok(html.includes(`property="og:title" content="${name} | Gloss Tools"`));
  }
});

test('M2: production preserves exact M1 bodies, styles, bootstrap and core', async () => {
  const source = await loadPublic();
  const production = await createProductionFiles();
  for (const path of ['index.html', 'en/index.html']) {
    const before = source.get(path).toString();
    const after = production.get(path).toString();
    assert.equal(after.slice(after.indexOf('<body>')), before.slice(before.indexOf('<body>')));
    assert.match(before, /noindex,nofollow/);
    assert.doesNotMatch(before, /hreflang=|rel="canonical"|application\/ld\+json/);
  }
  for (const path of ['css/app.css', 'js/bootstrap.js', 'js/app.js', 'js/core/calculate-box-fit.js', '404.html']) assert.equal(sha256(production.get(path)), sha256(source.get(path)));
});

test('M2: header rules really merge duplicates unless explicitly removed', () => {
  const unsafe = parseHeaders('/*\n  X-Robots-Tag: noindex,nofollow\n/index.html\n  X-Robots-Tag: index,follow\n');
  assert.equal(applyHeaders(unsafe, '/index.html')['x-robots-tag'], 'noindex,nofollow, index,follow');
  const safe = parseHeaders('/*\n  X-Robots-Tag: noindex,nofollow\n  Content-Security-Policy: default-src one\n/index.html\n  ! x-robots-tag\n  X-Robots-Tag: index,follow\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src two\n');
  assert.deepEqual(applyHeaders(safe, '/index.html'), { 'x-robots-tag': 'index,follow', 'content-security-policy': 'default-src two' });
  assert.equal(applyHeaders(safe, '/INDEX.HTML')['x-robots-tag'], 'noindex,nofollow');
  assert.equal(applyHeaders(safe, '/other')['content-security-policy'], 'default-src one');
});

test('M2: header wildcard matching escapes literal dots and validates directives', () => {
  const rules = parseHeaders('/a.*\n  Test: yes\n');
  assert.deepEqual(applyHeaders(rules, '/a.js'), { test: 'yes' });
  assert.deepEqual(applyHeaders(rules, '/aXjs'), {});
  assert.throws(() => parseHeaders('  Bad: value\n'), /without a route/);
  assert.throws(() => parseHeaders('/a\n  ! invalid header\n'), /Invalid removed/);
  assert.throws(() => parseHeaders('/a\n  invalid\n'), /Invalid header assignment/);
});

test('M2: robots longest-match, terminal anchors and case-sensitive paths', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /\nAllow: /js/\nDisallow: /js/private/\nAllow: /js/private/open.js$\n');
  for (const [path, expected] of [['/index.html', false], ['/js/app.js', true], ['/js/private/key.js', false], ['/js/private/open.js', true], ['/js/private/open.js.extra', false], ['/JS/app.js', false], ['/js/PRIVATE/key.js', true], ['/%6as/app.js', false]]) assert.equal(robotsAllowed(rules, path), expected, path);
});

test('M2: robots equal-specificity allow wins; wildcard behavior is exercised', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /same\nAllow: /same\nDisallow: /*.tmp$\n');
  assert.equal(robotsAllowed(rules, '/same'), true);
  assert.equal(robotsAllowed(rules, '/file.tmp'), false);
  assert.equal(robotsAllowed(rules, '/file.tmp.more'), true);
});

test('M2: actual robots permits both canonical pages and all public runtime assets', async () => {
  const files = await createProductionFiles();
  const rules = parseRobots(files.get('robots.txt').toString());
  for (const path of ['/index.html', '/en/index.html', '/css/app.css', '/js/app.js', '/js/bootstrap.js', '/js/core/calculate-box-fit.js', '/robots.txt', '/sitemap.xml']) assert.equal(robotsAllowed(rules, path), true, path);
  for (const path of ['/docs/README.md', '/test/core.test.mjs', '/scripts/dev.mjs', '/package.json', '/.git/config', '/.runs/a', '/CSS/app.css', '/js/app.js.extra']) assert.equal(robotsAllowed(rules, path), false, path);
  assert.deepEqual([...files.get('sitemap.xml').toString().matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), ['https://boxfit.glossquote.com/index.html', 'https://boxfit.glossquote.com/en/index.html']);
});

test('M2: redirects are explicit canonical-only 301 rules', async () => {
  const files = await createProductionFiles();
  assert.deepEqual([...parseRedirects(files.get('_redirects').toString())], [
    ['/', { location: 'https://boxfit.glossquote.com/index.html', status: 301 }],
    ['/en', { location: 'https://boxfit.glossquote.com/en/index.html', status: 301 }],
    ['/en/', { location: 'https://boxfit.glossquote.com/en/index.html', status: 301 }],
  ]);
  assert.throws(() => parseRedirects('/ https://untrusted.invalid/ 301'), /Unexpected production redirect/);
});

test('M2: production build verification rejects stale bytes, manifest and unexpected paths', async () => {
  const temporary = await mkdtemp(join(ROOT, '.test-production-'));
  try {
    const directory = join(temporary, 'assets');
    const files = await createProductionFiles();
    for (const [path, bytes] of files) { await mkdir(dirname(join(directory, path)), { recursive: true }); await writeFile(join(directory, path), bytes); }
    const manifestPath = `${directory}.manifest.json`;
    await writeFile(manifestPath, JSON.stringify(productionManifest(files)));
    assert.deepEqual([...await verifyProductionBuild(directory)], [...files]);
    await writeFile(join(directory, 'index.html'), 'stale fake fixture');
    await assert.rejects(verifyProductionBuild(directory), /Production bytes differ/);
    await writeFile(join(directory, 'index.html'), files.get('index.html'));
    await writeFile(manifestPath, '{}');
    await assert.rejects(verifyProductionBuild(directory), /Production manifest is stale/);
    await writeFile(manifestPath, JSON.stringify(productionManifest(files)));
    await writeFile(join(directory, 'unknown.txt'), 'fake fixture');
    await assert.rejects(verifyProductionBuild(directory), /Unexpected file/);
    await rm(join(directory, 'unknown.txt'));
    await link(manifestPath, join(temporary, 'linked-manifest.json'));
    await assert.rejects(verifyProductionBuild(directory), /Unsafe production manifest/);
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(ROOT));
    assert.ok(basename(temporary).startsWith('.test-production-'));
    await rm(temporary, { recursive: true });
  }
});

test('M2: actual offline loopback production HTTP GET/HEAD/MIME/SEO/CSP/redirect/404/405', async () => {
  const result = await checkProductionHttp(await createProductionFiles());
  assert.equal(result.status, 'PASS');
  assert.equal(result.records.length, 34);
  assert.match(result.scope, /not Cloudflare/);
});
