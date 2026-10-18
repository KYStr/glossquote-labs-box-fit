import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSource } from './lib/check-source.mjs';
import { ROOT, PUBLIC_FILES, assertTree, manifestOf, verifyBuild } from './lib/files.mjs';

try {
  const source = await checkSource();
  const directory = join(ROOT, 'dist');
  await assertTree(directory, [...PUBLIC_FILES, 'manifest.json'], { allowMissing: true });
  for (const [file, bytes] of source) {
    const path = join(directory, file);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'w' });
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifestOf(source), null, 2) + '\n');
  await verifyBuild();
  console.log('PASS: deterministic M1 noindex preview built in dist/ (8 static files + manifest.json).');
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
