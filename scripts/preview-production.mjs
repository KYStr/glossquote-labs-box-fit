import { requireNode } from './lib/files.mjs';
import { verifyProductionBuild } from './lib/production.mjs';
import { createProductionServer } from './lib/production-server.mjs';

try {
  requireNode();
  const server = createProductionServer(await verifyProductionBuild());
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Port 5213 occupied. Model stopped; no existing process was changed.' : 'Production model could not start.');
    process.exitCode = 1;
  });
  server.listen(5213, '127.0.0.1', () => console.log(`Production HTTP model http://127.0.0.1:5213/index.html | PID ${process.pid} | not Cloudflare`));
} catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
