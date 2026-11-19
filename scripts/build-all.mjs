import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('==> Building 2D DX...');
execSync('npm run build', { cwd: resolve(root, '2d'), stdio: 'inherit' });

console.log('==> Building 3D...');
if (!existsSync(resolve(root, '3d', 'dist', 'index.html'))) {
  execSync('npm run build', { cwd: resolve(root, '3d'), stdio: 'inherit' });
} else {
  execSync('npm run build', { cwd: resolve(root, '3d'), stdio: 'inherit' });
}

const dist = resolve(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(resolve(root, 'index.html'), resolve(dist, 'index.html'));
cpSync(resolve(root, 'portal-assets'), resolve(dist, 'portal-assets'), { recursive: true });
cpSync(resolve(root, '2d', 'dist'), resolve(dist, '2d'), { recursive: true });
// Make 2D DX playable even when opened directly via file:// in Finder
const dist2dHtml = resolve(dist, '2d', 'index.html');
const patched2d = readFileSync(dist2dHtml, 'utf8')
  .replace(/<script type="module" crossorigin /g, '<script defer ')
  .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" ');
writeFileSync(dist2dHtml, patched2d);
cpSync(resolve(root, '3d', 'dist'), resolve(dist, '3d'), { recursive: true });

console.log('==> Unified dist/ assembled at:', dist);
