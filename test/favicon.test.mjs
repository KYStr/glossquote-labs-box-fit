import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { checkSource } from '../scripts/lib/check-source.mjs';
import { createPreviewServer } from '../scripts/lib/server.mjs';
import { createProductionServer } from '../scripts/lib/production-server.mjs';
import { createProductionFiles, verifyM1Assets } from '../scripts/lib/production.mjs';
import { localRequest } from '../scripts/lib/release-http.mjs';

test('R2 favicon regression: original HTTP serves a local SVG permitted by both meta and header policies', async () => {
  const preview = await checkSource();
  const production = await createProductionFiles();
  for (const [mode, files, factory] of [['preview', preview, createPreviewServer], ['production', production, createProductionServer]]) {
    const server = factory(files);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    try {
      for (const page of ['/index.html', '/en/index.html']) {
        const response = await localRequest(port, page);
        assert.equal(response.status, 200);
        const html = response.bytes.toString();
        assert.equal([...html.matchAll(/<link rel="icon"/g)].length, 1);
        assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
        assert.doesNotMatch(html, /data:,/);
        const header = response.headers['content-security-policy'];
        const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)[1];
        assert.equal(meta, header.replace("; frame-ancestors 'none'", ''));
        for (const policy of [header, meta]) {
          const directives = new Map(policy.split('; ').map(rule => { const at = rule.indexOf(' '); return [rule.slice(0, at), rule.slice(at + 1)]; }));
          assert.equal(directives.get('img-src'), "'self'");
          for (const name of ['default-src', 'font-src', 'connect-src', 'object-src', 'base-uri', 'form-action']) assert.equal(directives.get(name), "'none'", `${mode}: ${name}`);
          assert.equal(directives.get('style-src'), "'self'");
          assert.match(directives.get('script-src'), mode === 'preview' ? /^'self'$/ : /^'self' 'sha256-[A-Za-z0-9+/]+=*'$/);
          assert.doesNotMatch(policy, /unsafe-|data:|https?:|\*/);
        }
        assert.ok(html.indexOf('<meta http-equiv="Content-Security-Policy"') < html.indexOf('<link rel="icon"'));
      }
      const get = await localRequest(port, '/favicon.svg');
      assert.equal(get.status, 200);
      assert.equal(get.headers['content-type'], 'image/svg+xml; charset=utf-8');
      assert.equal(get.headers['x-content-type-options'], 'nosniff');
      assert.deepEqual(get.bytes, preview.get('favicon.svg'));
      const head = await localRequest(port, '/favicon.svg', 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.headers['content-length'], String(get.bytes.length));
      assert.equal(head.bytes.length, 0);
      for (const path of ['/favicon.svg?fake=1', '/FAVICON.SVG', '/favicon.ico']) assert.equal((await localRequest(port, path)).status, 404);
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});

test('R2 baseline guard rejects changes outside the permitted favicon/CSP head correction', async () => {
  const source = await checkSource();
  await verifyM1Assets(source);
  for (const file of ['index.html', 'en/index.html']) {
    for (const [from, to] of [['<body>', '<body id="unreviewed">'], ['<title>', '<title>unreviewed ']]) {
      const altered = new Map(source);
      altered.set(file, Buffer.from(source.get(file).toString().replace(from, to)));
      await assert.rejects(verifyM1Assets(altered), /M1 public bytes/);
    }
  }
});
