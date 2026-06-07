import http from 'http';
import httpProxy from 'http-proxy';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Internal ports for sub-backends ───────────────────────────────────────────
const ARIA_PORT   = 3003;
const SEARCH_PORT = 3004;
// Render injects the public-facing port via PORT env var
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
  console.log(`[Gateway] Started ${name} on internal port ${port}`);
  return child;
}

// ─── Start both backends on their own internal ports ───────────────────────────
const ariaProc   = spawnBackend('ARIA',   'aria_backend',   ARIA_PORT);
const searchProc = spawnBackend('SEARCH', 'search_backend', SEARCH_PORT);

// ─── Create reverse proxy ───────────────────────────────────────────────────────
const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on('error', (err, _req, res) => {
  console.error('[Gateway] Proxy error:', err.message);
  if (res && 'writeHead' in res) {
    (res as http.ServerResponse).writeHead(502, { 'Content-Type': 'application/json' });
    (res as http.ServerResponse).end(JSON.stringify({ error: 'Backend unavailable', detail: err.message }));
  }
});

// ─── Route: Search backend handles /api/* and /health (search-only path) ───────
// Aria handles everything else (including Socket.IO / WebSocket upgrades)
function getTarget(url: string): string {
  if (url.startsWith('/api/') || url === '/api' || url.startsWith('/search')) {
    return `http://localhost:${SEARCH_PORT}`;
  }
  return `http://localhost:${ARIA_PORT}`;
}

// ─── HTTP Server (gateway) ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const target = getTarget(req.url || '/');
  proxy.web(req, res, { target });
});

// ─── WebSocket upgrade (Socket.IO) → ARIA ──────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target: `http://localhost:${ARIA_PORT}` });
});

// ─── Wait briefly for backends to start, then open gateway ─────────────────────
setTimeout(() => {
  server.listen(GATEWAY_PORT, '0.0.0.0', () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Nexal Backend Gateway');
    console.log(`  Public Port : ${GATEWAY_PORT}`);
    console.log(`  → /api/*    → Search Backend  (localhost:${SEARCH_PORT})`);
    console.log(`  → /*        → ARIA Backend    (localhost:${ARIA_PORT})`);
    console.log(`  Health      : http://0.0.0.0:${GATEWAY_PORT}/health`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  });
}, 2000); // Give backends 2s head-start

// ─── Graceful shutdown ──────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[Gateway] SIGTERM received — shutting down...');
  ariaProc.kill('SIGTERM');
  searchProc.kill('SIGTERM');
  server.close(() => process.exit(0));
});
