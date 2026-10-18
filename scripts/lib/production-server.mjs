import http from 'node:http';
import { extname } from 'node:path';
import { MIME } from './files.mjs';
import { parseHeaders, applyHeaders } from './headers.mjs';

export function parseRedirects(text) {
  const redirects = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^(\S+) (https:\/\/boxfit\.glossquote\.com\/(?:en\/)?index\.html) (301)$/.exec(line);
    if (!match || redirects.has(match[1])) throw new Error('Unexpected production redirect.');
    redirects.set(match[1], { location: match[2], status: Number(match[3]) });
  }
  return redirects;
}

export function createProductionServer(files) {
  const rules = parseHeaders(files.get('_headers').toString());
  const redirects = parseRedirects(files.get('_redirects').toString());
  const privateFiles = new Set(['_headers', '_redirects', 'manifest.json']);
  const server = http.createServer((request, response) => {
    const path = request.url;
    const headers = applyHeaders(rules, path);
    const send = (status, bytes, type, extra = {}) => {
      response.writeHead(status, { ...headers, 'Content-Type': type, 'Content-Length': bytes.length, ...extra });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    if (request.headers.host !== `127.0.0.1:${server.address().port}`) { send(400, Buffer.from('Invalid host.\n'), MIME['.txt']); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(405, Buffer.from('Method not allowed.\n'), MIME['.txt'], { Allow: 'GET, HEAD' });
      request.resume();
      return;
    }
    if (redirects.has(path)) {
      const redirect = redirects.get(path);
      send(redirect.status, Buffer.from('Canonical page.\n'), MIME['.txt'], { Location: redirect.location });
      return;
    }
    const file = path?.startsWith('/') ? path.slice(1) : '';
    if (!files.has(file) || privateFiles.has(file)) {
      send(404, files.get('404.html'), MIME['.html']);
      return;
    }
    send(file === '404.html' ? 404 : 200, files.get(file), MIME[extname(file)]);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  return server;
}
