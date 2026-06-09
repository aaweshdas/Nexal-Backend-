import http from 'http';
import httpProxy from 'http-proxy';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Internal ports for sub-backends ───────────────────────────────────────────
const ARIA_PORT   = 3003;
const SEARCH_PORT = 3004;
const GAME_PORT   = 3005;
const GATEWAY_PORT = parseInt(process.env.PORT || '10000', 10);

// ─── Spawn a sub-backend with an overridden PORT ────────────────────────────────
function spawnBackend(name: string, relPath: string, port: number): ChildProcess {
  const entryPoint = path.join(__dirname, '..', relPath, 'dist', 'index.js');
  const child = spawn('node', [entryPoint], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  });
  child.on('error', (err) => console.error(`[Gateway] ${name} spawn error:`, err));
  child.on('exit', (code) => console.warn(`[Gateway] ${name} exited with code ${code}`));
  console.log(`[Gateway] Spawned ${name} → internal port ${port}`);
  return child;
}

// ─── Poll a backend's /health until it responds (max 60 attempts × 1s) ─────────
async function waitForBackend(name: string, port: number, maxRetries = 60): Promise<void> {
  for (let i = 1; i <= maxRetries; i++) {
    const ready = await new Promise<boolean>((resolve) => {
      const req = http.get(
        { host: 'localhost', port, path: '/health', timeout: 1000 },
        () => resolve(true)
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ready) {
      console.log(`[Gateway] ✓ ${name} is ready (attempt ${i})`);
      return;
    }
    console.log(`[Gateway] Waiting for ${name}... (${i}/${maxRetries})`);
    await new Promise(r => setTimeout(r, 1000));
  }
  // Don't crash — continue anyway; proxy will serve 502 if truly down
  console.error(`[Gateway] ✗ ${name} did not respond after ${maxRetries}s — opening gateway anyway`);
}

// ─── Start all backends ────────────────────────────────────────────────────────
const ariaProc   = spawnBackend('ARIA',   'aria_backend',   ARIA_PORT);
const searchProc = spawnBackend('SEARCH', 'search_backend', SEARCH_PORT);
const gameProc   = spawnBackend('GAME',   'game_backend',   GAME_PORT);

// ─── Proxy setup ────────────────────────────────────────────────────────────────
const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on('error', (err: any, _req, res) => {
  console.error(`[Gateway] Proxy error: ${err.code || ''} ${err.message || ''}`);
  if (res && 'writeHead' in res) {
    try {
      (res as http.ServerResponse).writeHead(502, { 'Content-Type': 'application/json' });
      (res as http.ServerResponse).end(JSON.stringify({
        error: 'Backend temporarily unavailable',
        code: err.code,
        detail: err.message,
      }));
    } catch (_) { /* headers already sent */ }
  }
});

// ─── Routing: /api/*, /game/*, and /health (search) → backends ─────────────────
function getTarget(url: string): string {
  if (
    url.startsWith('/api/') || url === '/api' ||
    url.startsWith('/search')
  ) {
    return `http://localhost:${SEARCH_PORT}`;
  }
  if (
    url.startsWith('/game/') || url === '/game'
  ) {
    return `http://localhost:${GAME_PORT}`;
  }
  return `http://localhost:${ARIA_PORT}`;
}

// ─── HTTP server ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  
  // Redirect /game to /game/ to preserve relative paths
  if (url === '/game') {
    res.writeHead(301, { 'Location': '/game/' });
    res.end();
    return;
  }
  
  const target = getTarget(url);
  proxy.web(req, res, { target });
});

// ─── WebSocket upgrade → ARIA (Socket.IO) ──────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target: `http://localhost:${ARIA_PORT}` });
});

// ─── Wait for all backends, THEN open gateway ──────────────────────────────────
(async () => {
  await Promise.all([
    waitForBackend('ARIA',   ARIA_PORT),
    waitForBackend('SEARCH', SEARCH_PORT),
    waitForBackend('GAME',   GAME_PORT),
  ]);

  server.listen(GATEWAY_PORT, '0.0.0.0', () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Nexal Backend Gateway — LIVE');
    console.log(`  Public Port : ${GATEWAY_PORT}`);
    console.log(`  /api/*      → Search Backend  (localhost:${SEARCH_PORT})`);
    console.log(`  /game/*     → Game Backend    (localhost:${GAME_PORT})`);
    console.log(`  /*          → ARIA Backend    (localhost:${ARIA_PORT})`);
    console.log(`  Health      : http://0.0.0.0:${GATEWAY_PORT}/health`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  });
})();

// ─── Graceful shutdown ──────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[Gateway] SIGTERM — shutting down...');
  ariaProc.kill('SIGTERM');
  searchProc.kill('SIGTERM');
  gameProc.kill('SIGTERM');
  server.close(() => process.exit(0));
});
