import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { MIME, sha256 } from './files.mjs';
import { ORIGIN, CANONICALS, REDIRECTS, inlineHash, validateProduction } from './production.mjs';
import { createProductionServer } from './production-server.mjs';

export function localRequest(port, path, method = 'GET', host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path, method, headers: { Host: host } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
    request.end();
  });
}

export async function checkProductionHttp(files, suppliedPort) {
  validateProduction(files);
  let ownedServer;
  let port = suppliedPort;
  if (port === undefined) {
    ownedServer = createProductionServer(files);
    ownedServer.listen(0, '127.0.0.1');
    await once(ownedServer, 'listening');
    assert.equal(ownedServer.address().address, '127.0.0.1');
    port = ownedServer.address().port;
  }
  const records = [];
  try {
    for (const [file, bytes] of files) {
      if (file.startsWith('_')) continue;
      const path = '/' + file;
      const response = await localRequest(port, path);
      assert.equal(response.status, file === '404.html' ? 404 : 200);
      assert.equal(sha256(response.bytes), sha256(bytes));
      assert.equal(response.headers['content-type'], MIME[file.slice(file.lastIndexOf('.'))]);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['referrer-policy'], 'no-referrer');
      assert.equal(response.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
      const canonical = CANONICALS.includes(path);
      assert.equal(response.headers['x-robots-tag'], canonical ? 'index,follow' : 'noindex,nofollow');
      const csp = response.headers['content-security-policy'];
      assert.ok(csp.includes("connect-src 'none'") && csp.includes("form-action 'none'") && csp.includes("frame-ancestors 'none'"));
      assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
      if (canonical) {
        const html = response.bytes.toString();
        const json = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html)[1];
        assert.ok(csp.includes(`'sha256-${inlineHash(json)}'`));
        assert.equal(JSON.parse(json).url, ORIGIN + path);
        assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1);
        assert.equal([...html.matchAll(/hreflang=/g)].length, 3);
      }
      const head = await localRequest(port, path, 'HEAD');
      assert.equal(head.status, response.status);
      assert.equal(head.bytes.length, 0);
      assert.equal(head.headers['content-length'], String(bytes.length));
      records.push({ path, status: response.status, bytes: bytes.length, sha256: sha256(bytes), mime: response.headers['content-type'], robots: response.headers['x-robots-tag'], head: 'PASS', security: 'PASS' });
    }
    for (const [path, location] of Object.entries(REDIRECTS)) {
      for (const method of ['GET', 'HEAD']) {
        const response = await localRequest(port, path, method);
        assert.equal(response.status, 301);
        assert.equal(response.headers.location, location);
        assert.equal(response.headers['x-robots-tag'], 'noindex,nofollow');
        if (method === 'HEAD') assert.equal(response.bytes.length, 0);
        records.push({ path, method, status: 301, location });
      }
    }
    for (const path of ['/missing', '/en/missing', '/_headers', '/_redirects', '/manifest.json', '/package.json', '/scripts/build.mjs', '/.git/config', '/../package.json', '/%2e%2e/package.json', '/index.html?fake=1', '/INDEX.HTML', '//index.html']) {
      const response = await localRequest(port, path);
      assert.equal(response.status, 404);
      assert.deepEqual(response.bytes, files.get('404.html'));
      assert.equal(response.headers['x-robots-tag'], 'noindex,nofollow');
      assert.doesNotMatch(response.bytes.toString(), /id="calculator"/);
      records.push({ path, status: 404, noSpaFallback: true });
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await localRequest(port, '/index.html', method);
      assert.equal(response.status, 405);
      assert.equal(response.headers.allow, 'GET, HEAD');
      records.push({ path: '/index.html', method, status: 405 });
    }
    assert.equal((await localRequest(port, '/index.html', 'GET', 'untrusted.invalid')).status, 400);
    records.push({ hostCheck: 'PASS', status: 400 });
    return { status: 'PASS', scope: 'Offline loopback HTTP model; not Cloudflare or live-site evidence', port, records };
  } finally {
    if (ownedServer) await new Promise((resolve, reject) => ownedServer.close(error => error ? reject(error) : resolve()));
  }
}
