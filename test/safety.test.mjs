import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, link, symlink, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { checkSource } from '../scripts/lib/check-source.mjs';
import { ROOT, assertTree, manifestOf, MIME, sha256 } from '../scripts/lib/files.mjs';
import { createPreviewServer, SECURITY_HEADERS } from '../scripts/lib/server.mjs';

test('Static source contract: no dependencies, network/storage APIs or unsafe rendering', async () => {
  const files = await checkSource();
  assert.equal(files.size, 9);
});

test('Manifest is deterministic and records exact file bytes', () => {
  const fixture = new Map([['fake.txt', Buffer.from('fake data\n')]]);
  const expected = { schemaVersion: 1, mode: 'm1-preview', files: [{ path: 'fake.txt', bytes: 10, sha256: sha256(Buffer.from('fake data\n')) }] };
  assert.deepEqual(manifestOf(fixture), expected);
  assert.deepEqual(manifestOf(fixture), expected);
});

test('Static trees reject unknown files, directories, junctions and hard links', async () => {
  const directory = await mkdtemp(join(ROOT, '.test-workspace-'));
  try {
    const original = join(directory, 'safe.txt');
    await writeFile(original, 'offline fake fixture');
    assert.deepEqual(await assertTree(directory, ['safe.txt']), ['safe.txt']);
    await assert.rejects(assertTree(directory, []), /Unexpected file/);
    await link(original, join(directory, 'linked.txt'));
    await assert.rejects(assertTree(directory, ['safe.txt', 'linked.txt']), /hard link/);
    await rm(join(directory, 'linked.txt'));
    await mkdir(join(directory, 'target'));
    await assert.rejects(assertTree(directory, ['safe.txt']), /Unexpected static directory/);
    await symlink(join(directory, 'target'), join(directory, 'junction'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(assertTree(directory, ['safe.txt', 'junction/file.txt', 'target/file.txt']), /Links are not permitted/);
  } finally {
    const absolute = resolve(directory);
    assert.equal(dirname(absolute), resolve(ROOT));
    assert.ok(basename(absolute).startsWith('.test-workspace-'));
    await rm(absolute, { recursive: true });
  }
});

function request(port, path, method = 'GET', host = `127.0.0.1:${port}`) {
  return new Promise((resolveRequest, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { Host: host } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveRequest({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('Actual loopback HTTP: MIME, security headers, HEAD, 404, 405, exact routes and host', async t => {
  const files = await checkSource();
  const server = createPreviewServer(files);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port, address } = server.address();
  assert.equal(address, '127.0.0.1');
  try {
    await t.test('every static asset has correct bytes, MIME and noindex/CSP', async () => {
      for (const [file, bytes] of files) {
        const response = await request(port, `/${file}`);
        assert.equal(response.status, file === '404.html' ? 404 : 200);
        assert.deepEqual(response.body, bytes);
        const extension = file.slice(file.lastIndexOf('.'));
        assert.equal(response.headers['content-type'], MIME[extension]);
        for (const [header, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers[header.toLowerCase()], value);
      }
    });
    await t.test('root aliases and HEAD preserve status and length without a body', async () => {
      for (const [path, file] of [['/', 'index.html'], ['/en/', 'en/index.html']]) {
        const response = await request(port, path, 'HEAD');
        assert.equal(response.status, 200);
        assert.equal(response.headers['content-length'], String(files.get(file).length));
        assert.equal(response.body.length, 0);
      }
    });
    await t.test('unknown, encoded, traversal, query and private build paths are 404 with no input echo', async () => {
      for (const path of ['/missing-CANARY_SECRET', '/%2e%2e/package.json', '/../package.json', '//index.html', '/index.html?CANARY_SECRET=1', '/sitemap.xml', '/manifest.json', '/js/../index.html', '/js/core/%63alculate-box-fit.js']) {
        const response = await request(port, path);
        assert.equal(response.status, 404);
        assert.deepEqual(response.body, files.get('404.html'));
        assert.doesNotMatch(response.body.toString(), /CANARY_SECRET|id="calculator"/);
      }
    });
    await t.test('unsupported methods produce 405 without SPA fallback', async () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        const response = await request(port, '/index.html', method);
        assert.equal(response.status, 405);
        assert.equal(response.headers.allow, 'GET, HEAD');
        assert.doesNotMatch(response.body.toString(), /id="calculator"/);
      }
    });
    await t.test('unexpected host is rejected', async () => {
      assert.equal((await request(port, '/index.html', 'GET', 'untrusted.invalid')).status, 400);
    });
  } finally {
    await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  }
});
