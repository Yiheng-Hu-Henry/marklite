/** 命令行入口。 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { build } from './site.js';
import { startDevServer } from './server.js';

const USAGE = `marklite —— 零依赖的 Markdown 静态站点生成器

用法：
  marklite build [选项]      把 content/*.md 构建到 dist/
  marklite serve [选项]      构建并启动开发服务器（改文件自动重建）
  marklite clean             删除输出目录

选项：
  --src <dir>        Markdown 源目录（默认 content）
  --out <dir>        输出目录（默认 dist）
  --layouts <dir>    模板目录（默认 layouts）
  --force            忽略缓存，全量重建
  --port <n>         端口（默认 4000，仅 serve）
  -h, --help         显示帮助
  -v, --version      显示版本

站点标题等配置写在 marklite.config.json：
  { "title": "我的博客", "description": "…", "author": "…" }
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('-')) {
      args._.push(token);
      continue;
    }
    const trimmed = token.replace(/^--?/, '');
    const equalAt = trimmed.indexOf('=');
    if (equalAt >= 0) {
      args[trimmed.slice(0, equalAt)] = trimmed.slice(equalAt + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('-')) {
      args[trimmed] = next;
      index += 1;
    } else {
      args[trimmed] = true;
    }
  }
  return args;
}

async function readConfig(cwd) {
  try {
    const raw = await fs.readFile(path.join(cwd, 'marklite.config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0] ?? 'build';

  if (args.help || args.h) {
    console.log(USAGE);
    return 0;
  }
  if (args.version || args.v) {
    console.log('marklite 0.1.0');
    return 0;
  }

  const cwd = process.cwd();
  const config = await readConfig(cwd);
  const options = {
    srcDir: args.src ?? config.src ?? 'content',
    outDir: args.out ?? config.out ?? 'dist',
    layoutsDir: args.layouts ?? config.layouts ?? 'layouts',
    site: config.site ?? config,
    force: Boolean(args.force),
  };

  if (command === 'clean') {
    await fs.rm(path.resolve(cwd, options.outDir), { recursive: true, force: true });
    console.log(`[marklite] 已删除 ${options.outDir}`);
    return 0;
  }

  if (command === 'build') {
    try {
      const result = await build(options);
      console.log(
        `[marklite] 构建完成：${result.total} 篇文章，` +
          `${result.built.length} 篇写入，${result.skipped.length} 篇命中缓存` +
          (result.removed.length ? `，清理 ${result.removed.length} 个旧页面` : '')
      );
      console.log(`[marklite] 输出目录：${result.outDir}`);
      return 0;
    } catch (error) {
      console.error(`[marklite] 构建失败：${error.message}`);
      return 1;
    }
  }

  if (command === 'serve') {
    try {
      await build(options);
    } catch (error) {
      console.error(`[marklite] 首次构建失败：${error.message}`);
      return 1;
    }

    const port = Number(args.port ?? config.port ?? 4000);
    const dev = await startDevServer({ ...options, port });
    try {
      await dev.listen();
    } catch (error) {
      console.error(`[marklite] 起服务失败：${error.message}`);
      return 1;
    }
    console.log(`[marklite] 开发服务器：http://localhost:${port}/`);
    console.log('[marklite] 修改 content/ 或 layouts/ 会自动重建，Ctrl+C 退出。');

    const shutdown = async () => {
      await dev.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await new Promise(() => {});
  }

  console.error(`未知命令：${command}\n`);
  console.log(USAGE);
  return 2;
}
