import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' };

export function staticSite(directory) {
  const root = resolve(directory);
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end(); return; }
    const parts = pathname.replaceAll('\\', '/').split('/');
    if (parts.some((part) => part.startsWith('.') || ['data', 'server', 'scripts', 'src'].includes(part)) || pathname.includes('\0')) {
      res.writeHead(404); res.end(); return;
    }
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(404); res.end(); return; }
    try {
      let details;
      try { details = await stat(file); } catch { /* A client-side route uses index.html. */ }
      if (!details?.isFile()) {
        if (extname(pathname)) { res.writeHead(404); res.end(); return; }
        file = resolve(root, 'index.html'); details = await stat(file);
      }
      res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
        'Content-Length': details.size, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch { res.writeHead(503); res.end('Website build unavailable. Run npm run build.'); }
  };
}
