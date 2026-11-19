import http from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const startPort = Number(process.env.PORT || 8080);
const shouldOpen = !process.argv.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};

function createAppServer() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/2d' || urlPath === '/3d') {
      res.writeHead(301, { Location: `${urlPath}/` });
      res.end();
      return;
    }

    let filePath = resolve(root, '.' + urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = resolve(filePath, 'index.html');
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
  });
}

function listenWithFallback(port, attemptsLeft = 20) {
  const server = createAppServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`ポート ${port} は使用中のため、${port + 1} を試します...`);
      listenWithFallback(port + 1, attemptsLeft - 1);
    } else {
      console.error('サーバー起動エラー:', err);
      process.exit(1);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const localUrl = `http://localhost:${port}/`;
    console.log(`\n🦀 カニジャンプ コレクション配信中:`);
    console.log(`   Local:   ${localUrl}`);
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const net of nets || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`   Network: http://${net.address}:${port}/`);
        }
      }
    }
    console.log('   終了するには Ctrl+C を押してください。\n');

    if (shouldOpen && process.platform === 'darwin') {
      spawn('open', [localUrl], { stdio: 'ignore', detached: true }).unref();
    }
  });
}

listenWithFallback(startPort);
