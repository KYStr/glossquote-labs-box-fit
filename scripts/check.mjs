import { spawnSync } from 'node:child_process';
import { checkSource } from './lib/check-source.mjs';
import { ROOT } from './lib/files.mjs';

try {
  const source = await checkSource();
  for (const file of ['public/js/bootstrap.js', 'public/js/app.js', 'public/js/core/calculate-box-fit.js', 'scripts/build.mjs', 'scripts/check.mjs', 'scripts/dev.mjs', 'scripts/lib/check-source.mjs', 'scripts/lib/csp.mjs', 'scripts/lib/files.mjs', 'scripts/lib/server.mjs', 'scripts/lib/production.mjs', 'scripts/lib/headers.mjs', 'scripts/lib/robots.mjs', 'scripts/lib/production-server.mjs', 'scripts/lib/release-http.mjs', 'scripts/build-production.mjs', 'scripts/check-production.mjs', 'scripts/release-check.mjs', 'scripts/preview-production.mjs', 'test/core.test.mjs', 'test/safety.test.mjs', 'test/production.test.mjs', 'test/favicon.test.mjs']) {
    const check = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    if (check.status !== 0) throw new Error('JavaScript syntax check failed.');
  }
  console.log(`PASS: ${source.size} public files; exact static allowlist, noindex, disabled controls, safe APIs and JavaScript syntax.`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
