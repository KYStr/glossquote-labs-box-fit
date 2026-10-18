import { verifyBuild, requireNode } from './lib/files.mjs';
import { createPreviewServer } from './lib/server.mjs';

try {
  requireNode();
  const server = createPreviewServer(await verifyBuild());
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Port 4213 is occupied. Preview stopped; no existing process was changed.' : 'Preview could not start.');
    process.exitCode = 1;
  });
  server.listen(4213, '127.0.0.1', () => console.log(`M1 preview http://127.0.0.1:4213/ | PID ${process.pid} | noindex,nofollow`));
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
