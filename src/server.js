/**
 * 开发服务器。
 *
 * 静态文件 + 源文件轮询。用轮询而不是 fs.watch，是因为后者的行为在
 * Windows / macOS / Linux 上差异很大（重命名、编辑器原子保存都会漏事件），
 * 而一个几百毫秒比较 mtime 的开销在这个场景里可以忽略。
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { build } from './site.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const RELOAD_SNIPPET = `<script>(function(){var v="__VERSION__";setInterval(function(){fetch("/__version",{cache:"no-store"}).then(function(r){return r.text()}).then(function(n){if(n.trim()!==v)location.reload()}).catch(function(){})},1200)})();</script>`;

export async function snapshot(srcDir, layoutsDir) {
  const parts = [];
  for (const dir of [srcDir, layoutsDir]) {
    let entries = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries.sort()) {
      try {
        const stat = await fs.stat(path.join(dir, name));
        parts.push(`${name}:${stat.mtimeMs}:${stat.size}`);
      } catch {
        /* 文件刚被删，忽略 */
      }
    }
  }
  return parts.join('|');
}

/**
 * @param {{
 *   outDir: string, srcDir: string, layoutsDir: string,
 *   site?: Record<string, string>, port?: number,
 *   log?: (message: string) => void, debounceMs?: number
 * }} options
 */
export async function startDevServer(options) {
  const root = path.resolve(options.outDir);
  const log = options.log ?? ((message) => console.log(message));
  const debounce = options.debounceMs ?? 800;
  let version = 0;

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/__version') {
      response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      response.end(String(version));
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end('bad request');
      return;
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const filePath = path.resolve(root, `.${pathname}`);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      response.writeHead(403, { 'Content-Type': 'text/plain' });
      response.end('forbidden');
      return;
    }

    try {
      const data = await fs.readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const type = MIME[extension] ?? 'application/octet-stream';

      if (extension === '.html') {
        const html = data
          .toString('utf8')
          .replace('</body>', `${RELOAD_SNIPPET.replace('__VERSION__', String(version))}</body>`);
        response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        response.end(html);
        return;
      }

      response.writeHead(200, { 'Content-Type': type });
      response.end(data);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<h1>404</h1><p>没有找到这个页面。</p>');
    }
  });

  let signature = await snapshot(options.srcDir, options.layoutsDir);
  const timer = setInterval(async () => {
    try {
      const next = await snapshot(options.srcDir, options.layoutsDir);
      if (next === signature) return;
      signature = next;
      const result = await build({
        srcDir: options.srcDir,
        outDir: options.outDir,
        layoutsDir: options.layoutsDir,
        site: options.site,
      });
      version += 1;
      log(`[marklite] 重建完成：${result.built.length} 篇更新，${result.skipped.length} 篇命中缓存`);
    } catch (error) {
      log(`[marklite] 构建失败：${error.message}`);
    }
  }, debounce);

  return {
    server,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 4000, () => resolve(server.address()));
      });
    },
    close() {
      clearInterval(timer);
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
