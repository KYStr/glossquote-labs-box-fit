import { lstat, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PUBLIC_FILES = Object.freeze([
  '404.html', 'css/app.css', 'en/index.html', 'index.html',
  'js/app.js', 'js/bootstrap.js', 'js/core/calculate-box-fit.js', 'robots.txt',
]);
export const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' });
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function requireNode() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required.');
}

export async function assertTree(directory, allowedFiles, { allowMissing = false } = {}) {
  const allowed = new Set(allowedFiles);
  const allowedDirectories = new Set(['']);
  for (const file of allowedFiles) {
    const parts = file.split('/');
    parts.pop();
    while (parts.length) { allowedDirectories.add(parts.join('/')); parts.pop(); }
  }
  const found = [];
  async function visit(relative) {
    const path = relative ? join(directory, relative) : directory;
    let stat;
    try { stat = await lstat(path); }
    catch (error) { if (!relative && allowMissing && error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) throw new Error('Links are not permitted in static trees.');
    if (stat.isDirectory()) {
      if (!allowedDirectories.has(relative)) throw new Error('Unexpected static directory.');
      for (const entry of await readdir(path)) await visit(relative ? `${relative}/${entry}` : entry);
    } else if (stat.isFile()) {
      if (!allowed.has(relative) || stat.nlink !== 1) throw new Error('Unexpected file or hard link in static tree.');
      found.push(relative);
    } else throw new Error('Unsupported static entry.');
  }
  await visit('');
  return found.sort();
}

export async function loadPublic(directory = join(ROOT, 'public')) {
  const files = await assertTree(directory, PUBLIC_FILES);
  if (JSON.stringify(files) !== JSON.stringify(PUBLIC_FILES)) throw new Error('Missing public file.');
  const loaded = new Map();
  for (const file of files) {
    const bytes = await readFile(join(directory, file));
    if (bytes.byteLength > 128 * 1024) throw new Error('Static file size cap exceeded.');
    loaded.set(file, bytes);
  }
  return loaded;
}

export function manifestOf(loaded) {
  return { schemaVersion: 1, mode: 'm1-preview', files: [...loaded].map(([path, bytes]) => ({ path, bytes: bytes.byteLength, sha256: sha256(bytes) })) };
}

export async function verifyBuild() {
  const source = await loadPublic();
  const expected = manifestOf(source);
  const directory = join(ROOT, 'dist');
  const entries = await assertTree(directory, [...PUBLIC_FILES, 'manifest.json']);
  if (entries.length !== PUBLIC_FILES.length + 1) throw new Error('Incomplete preview build.');
  const actual = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Stale preview build. Run npm run build.');
  const built = new Map();
  for (const file of PUBLIC_FILES) built.set(file, await readFile(join(directory, file)));
  if (JSON.stringify(manifestOf(built)) !== JSON.stringify(expected)) throw new Error('Preview build content mismatch.');
  return built;
}
