import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, assertTree, verifyBuild, manifestOf } from './lib/files.mjs';
import { createProductionFiles, PRODUCTION_FILES, productionManifest, validateProduction, verifyProductionBuild } from './lib/production.mjs';

try {
  const previewBefore = manifestOf(await verifyBuild());
  const files = await createProductionFiles();
  validateProduction(files);
  const directory = join(ROOT, 'dist-production');
  await assertTree(directory, PRODUCTION_FILES, { allowMissing: true });
  for (const [path, bytes] of files) {
    await mkdir(join(directory, path, '..'), { recursive: true });
    await writeFile(join(directory, path), bytes);
  }
  const manifestPath = `${directory}.manifest.json`;
  try {
    const stat = await lstat(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe production manifest path.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(manifestPath, JSON.stringify(productionManifest(files), null, 2) + '\n');
  await verifyProductionBuild();
  if (JSON.stringify(previewBefore) !== JSON.stringify(manifestOf(await verifyBuild()))) throw new Error('Preview bytes changed during production build.');
  console.log('PASS: isolated production build, exact SEO/CSP/robots/headers; M1 preview unchanged.');
} catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
