// Lokaler Entwicklungs-Server ohne Abhängigkeiten: liefert src/ aus, ohne Cache.
// Schickt dieselben Sicherheits-Header wie Netlify (aus netlify.toml), damit Verstöße schon lokal auffallen.
// Start: node tools/serve.mjs  →  http://localhost:5600  (im WLAN auch per IP vom Handy)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..', 'src');
const PORT = Number(process.env.PORT) || 5600;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// Header für "/*" aus netlify.toml (einfaches Parsen: Schlüssel = "Wert")
const toml = readFileSync(resolve(import.meta.dirname, '..', 'netlify.toml'), 'utf8');
const block = toml.split('[[headers]]').find(b => /for = "\/\*"/.test(b)) || '';
const HEADERS = Object.fromEntries([...block.matchAll(/^\s*([\w-]+) = "(.*)"$/gm)].filter(([, k]) => k !== 'for').map(([, k, v]) => [k, v]));
delete HEADERS['Strict-Transport-Security']; // lokal kein HTTPS

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(file).catch(() => null);
    const target = info?.isFile() ? file : join(ROOT, 'index.html');
    const body = await readFile(target);
    res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`sports läuft auf http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  im WLAN: http://${ip}:${PORT}`);
});
