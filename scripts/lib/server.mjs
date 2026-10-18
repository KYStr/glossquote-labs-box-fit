import http from 'node:http';
import { extname } from 'node:path';
import { MIME } from './files.mjs';

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-Robots-Tag': 'noindex,nofollow',
  'Cache-Control': 'no-store',
});

export function createPreviewServer(files) {
  const server = http.createServer((request, response) => {
    const send = (status, bytes, contentType, extra = {}) => {
      response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': contentType, 'Content-Length': bytes.length, ...extra });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    if (request.headers.host !== `127.0.0.1:${server.address().port}`) {
      send(400, Buffer.from('Invalid host.\n'), MIME['.txt']);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(405, Buffer.from('Method not allowed.\n'), MIME['.txt'], { Allow: 'GET, HEAD' });
      request.resume();
      return;
    }
    const routes = new Map([...files.keys()].map(file => [`/${file}`, file]));
    routes.set('/', 'index.html');
    routes.set('/en/', 'en/index.html');
    const file = routes.get(request.url);
    if (!file) { send(404, files.get('404.html'), MIME['.html']); return; }
    send(file === '404.html' ? 404 : 200, files.get(file), MIME[extname(file)]);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  return server;
}
