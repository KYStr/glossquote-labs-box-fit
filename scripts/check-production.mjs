import { verifyProductionBuild, validateProduction } from './lib/production.mjs';

try {
  const result = validateProduction(await verifyProductionBuild());
  console.log(`PASS: production bytes/schema/SEO/headers/robots; ${result.staticFiles} static files, ${result.canonicalPages} canonical pages, ${result.jsonLdHashes} exact JSON-LD hashes.`);
} catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
