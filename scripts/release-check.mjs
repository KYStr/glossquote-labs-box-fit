import { verifyProductionBuild } from './lib/production.mjs';
import { checkProductionHttp } from './lib/release-http.mjs';

try {
  const result = await checkProductionHttp(await verifyProductionBuild());
  console.log(`PASS: ${result.records.length} actual offline loopback HTTP checks for GET/HEAD/MIME/SEO/CSP/headers/redirect/404/405/host. This is a local model, not a Cloudflare release.`);
} catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
