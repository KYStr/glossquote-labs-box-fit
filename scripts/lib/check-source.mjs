import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadPublic, requireNode } from './files.mjs';

export async function checkSource() {
  requireNode();
  const loaded = await loadPublic();
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.private, true);
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) assert.equal(Object.keys(pkg[key] ?? {}).length, 0);
  for (const [file, bytes] of loaded) {
    const text = bytes.toString('utf8');
    if (file.endsWith('.js')) {
      assert.doesNotMatch(text, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|caches|serviceWorker|Worker|SharedWorker|eval|Function)\b/);
      assert.doesNotMatch(text, /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|document\s*\.\s*(?:cookie|write)|\bconsole\s*\.|\bhistory\s*\.|\bimport\s*\(/);
      assert.doesNotMatch(text, /https?:|navigator\s*\./);
    }
    if (file.endsWith('.css')) assert.doesNotMatch(text, /@import|url\s*\(|@font-face/i);
    if (file.endsWith('.html')) {
      assert.match(text, /<meta name="robots" content="noindex,nofollow">/);
      assert.doesNotMatch(text, /\bname\s*=\s*["'](?:box|item|gap|allow)|<input[^>]*\bname\s*=/i);
      assert.doesNotMatch(text, /rel=["'](?:canonical|alternate)|application\/ld\+json|\bon\w+\s*=|<style\b|\bstyle\s*=/i);
      assert.doesNotMatch(text, /<script(?![^>]*\bsrc=)[^>]*>/i);
      for (const match of text.matchAll(/<(?:input|button|fieldset)\b[^>]*>/g)) assert.match(match[0], /\bdisabled\b/);
      for (const match of text.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
        const url = match[1];
        assert.ok(url.startsWith('/') || url === '#boxLengthRaw' || url === 'data:,' || url === 'https://glossquote.com/index.html' || url === 'https://glossquote.com/en/index.html', 'Unexpected static URL.');
        assert.ok(!url.startsWith('//'), 'Protocol-relative URLs are forbidden.');
      }
    }
  }
  const bootstrap = loaded.get('js/bootstrap.js').toString('utf8');
  assert.match(bootstrap, /addEventListener\('submit', function preventSubmission\(event\)\s*\{\s*event\.preventDefault\(\);\s*\}, true\)/);
  for (const file of ['index.html', 'en/index.html']) {
    const page = loaded.get(file).toString('utf8');
    assert.ok(page.indexOf('<script src="/js/bootstrap.js"></script>') < page.indexOf('<form'));
    assert.equal([...page.matchAll(/<input\b/g)].length, 8);
    assert.equal([...page.matchAll(/type="text" inputmode="decimal" maxlength="12"/g)].length, 7);
    assert.match(page, /<div id="comparison-scroll"[^>]*role="region"[^>]*tabindex="0">/);
    assert.equal([...page.matchAll(/<th scope="col">/g)].length, 6);
    assert.match(page, /<caption>/);
    assert.match(page, new RegExp(file === 'index.html' ? 'https://glossquote.com/index.html' : 'https://glossquote.com/en/index.html'));
  }
  assert.equal(loaded.get('robots.txt').toString('utf8'), 'User-agent: *\nDisallow: /\n');
  return loaded;
}
