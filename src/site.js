/**
 * 构建流程：content/*.md + layouts/*.html -> dist/。
 *
 * 增量策略很直接：把「原文 + 布局」算一个哈希存进缓存，哈希没变且产物还在
 * 就跳过。布局改了会让所有页面的哈希一起变，所以改模板必然触发全量重建 ——
 * 这正是想要的行为。
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseFrontmatter } from './frontmatter.js';
import { escapeHtml, renderMarkdown, stripTags } from './markdown.js';
import { renderTemplate } from './template.js';

export const CACHE_FILE = '.marklite-cache.json';

export const DEFAULT_SITE = {
  title: 'marklite',
  description: '',
  author: '',
};

function hashOf(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : text;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag));
  if (tags === undefined || tags === null || tags === '') return [];
  return [String(tags)];
}

function formatTags(tags) {
  return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
}

function readingMinutes(plain) {
  const cjk = (plain.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = plain
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * 构建整站。
 * @param {{
 *   srcDir?: string, outDir?: string, layoutsDir?: string,
 *   site?: Record<string, string>, force?: boolean
 * }} options
 */
export async function build(options = {}) {
  const srcDir = path.resolve(options.srcDir ?? 'content');
  const outDir = path.resolve(options.outDir ?? 'dist');
  const layoutsDir = path.resolve(options.layoutsDir ?? 'layouts');
  const site = { ...DEFAULT_SITE, ...(options.site ?? {}) };
  const force = Boolean(options.force);

  const [postLayout, indexLayout] = await Promise.all([
    fs.readFile(path.join(layoutsDir, 'post.html'), 'utf8'),
    fs.readFile(path.join(layoutsDir, 'index.html'), 'utf8'),
  ]);

  await fs.mkdir(outDir, { recursive: true });

  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();

  const cachePath = path.join(outDir, CACHE_FILE);
  const cache = force ? {} : await readJson(cachePath, {});

  const posts = [];
  const built = [];
  const skipped = [];
  const year = new Date().getFullYear();
  const nextCache = {};

  for (const file of files) {
    const filePath = path.join(srcDir, file);
    const raw = await fs.readFile(filePath, 'utf8');
    const hash = hashOf(`${raw}\u0000${postLayout}`);

    const { data, content } = parseFrontmatter(raw);
    const html = renderMarkdown(content);
    const plain = stripTags(html);

    const slug = file.replace(/\.md$/, '');
    const title = String(data.title ?? slug);
    const date = normalizeDate(data.date);
    const tags = normalizeTags(data.tags);
    const excerpt = String(
      data.excerpt ?? (plain.length > 140 ? `${plain.slice(0, 140)}…` : plain)
    );
    const minutes = readingMinutes(plain);

    const outFile = `${slug}.html`;
    nextCache[file] = { hash, out: outFile };

    posts.push({ slug, title, date, tags, excerpt, minutes });

    const cached = cache[file];
    const outPath = path.join(outDir, outFile);
    if (!force && cached && cached.hash === hash && (await exists(outPath))) {
      skipped.push(file);
      continue;
    }

    const page = renderTemplate(postLayout, {
      site,
      content: html,
      title,
      slug,
      date: date ?? '',
      tags: formatTags(tags),
      excerpt,
      readingTime: `${minutes} 分钟`,
      year,
    });
    await fs.writeFile(outPath, page, 'utf8');
    built.push(outFile);
  }

  posts.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

  const listHtml = posts
    .map(
      (post) => `<article class="post">
  <a class="post-title" href="./${post.slug}.html">${escapeHtml(post.title)}</a>
  <div class="post-meta">${post.date ?? ''}${post.date ? ' · ' : ''}${post.minutes} 分钟</div>
  <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
  <div class="drop">${formatTags(post.tags)}</div>
</article>`
    )
    .join('\n');

  const indexPage = renderTemplate(indexLayout, {
    site,
    content: listHtml || '<p class="post-excerpt">还没有文章。</p>',
    count: posts.length,
    year,
  });
  const indexPath = path.join(outDir, 'index.html');
  const previousIndex = (await exists(indexPath)) ? await fs.readFile(indexPath, 'utf8') : null;
  if (previousIndex !== indexPage) {
    await fs.writeFile(indexPath, indexPage, 'utf8');
  }

  const expected = new Set(['index.html', ...posts.map((post) => `${post.slug}.html`)]);
  const removed = [];
  const produced = await fs.readdir(outDir);
  for (const file of produced) {
    if (!file.endsWith('.html') || expected.has(file)) continue;
    await fs.unlink(path.join(outDir, file));
    removed.push(file);
  }

  await fs.writeFile(cachePath, `${JSON.stringify(nextCache, null, 2)}\n`, 'utf8');

  return { built, skipped, removed, total: posts.length, outDir, indexChanged: previousIndex !== indexPage };
}
