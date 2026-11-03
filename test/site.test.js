import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { build } from '../src/site.js';

const POST_LAYOUT = `<html><head><title>{{title}} · {{site.title}}</title></head>
<body><main>{{content}}</main><footer>{{date}} {{readingTime}}</footer></body></html>`;

const INDEX_LAYOUT = `<html><body><h1>{{site.title}}</h1><div class="count">{{count}}</div>{{content}}</body></html>`;

async function makeProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'marklite-test-'));
  await mkdir(path.join(root, 'content'), { recursive: true });
  await mkdir(path.join(root, 'layouts'), { recursive: true });
  await writeFile(path.join(root, 'layouts', 'post.html'), POST_LAYOUT);
  await writeFile(path.join(root, 'layouts', 'index.html'), INDEX_LAYOUT);
  return root;
}

async function writePost(root, name, body) {
  await writeFile(path.join(root, 'content', `${name}.md`), body);
}

function options(root, extra = {}) {
  return {
    srcDir: path.join(root, 'content'),
    outDir: path.join(root, 'dist'),
    layoutsDir: path.join(root, 'layouts'),
    site: { title: '测试站', description: '描述', author: '我' },
    ...extra,
  };
}

test('构建生成 index 与每篇文章', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'first', '---\ntitle: 第一篇\ndate: 2026-01-01\n---\n\n# 标题\n\n正文');
  await writePost(root, 'second', '---\ntitle: 第二篇\ndate: 2026-02-01\n---\n\n内容');

  const result = await build(options(root));
  assert.equal(result.total, 2);
  assert.equal(result.built.length, 2);

  const first = await readFile(path.join(root, 'dist', 'first.html'), 'utf8');
  assert.match(first, /<title>第一篇 · 测试站<\/title>/);
  assert.match(first, /<h1 id="标题">标题<\/h1>/);

  const index = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(index, /<div class="count">2<\/div>/);
  assert.match(index, /第二篇/);
  assert.ok(index.indexOf('第二篇') < index.indexOf('第一篇'), '应按日期倒序');
});

test('未变化的文件命中缓存', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'a', '---\ntitle: A\n---\n正文');
  await build(options(root));

  const second = await build(options(root));
  assert.equal(second.built.length, 0);
  assert.equal(second.skipped.length, 1);
});

test('改一篇只重建那一篇', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'a', '---\ntitle: A\n---\n正文');
  await writePost(root, 'b', '---\ntitle: B\n---\n正文');
  await build(options(root));

  await writePost(root, 'a', '---\ntitle: A\n---\n改过的正文');
  const result = await build(options(root));

  assert.deepEqual(result.built, ['a.html']);
  assert.deepEqual(result.skipped, ['b.md']);
});

test('改布局触发全量重建', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'a', '---\ntitle: A\n---\n正文');
  await writePost(root, 'b', '---\ntitle: B\n---\n正文');
  await build(options(root));

  await writeFile(path.join(root, 'layouts', 'post.html'), `${POST_LAYOUT}<!-- v2 -->`);
  const result = await build(options(root));
  assert.equal(result.built.length, 2);
});

test('force 忽略缓存', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'a', '---\ntitle: A\n---\n正文');
  await build(options(root));

  const forced = await build(options(root, { force: true }));
  assert.equal(forced.built.length, 1);
  assert.equal(forced.skipped.length, 0);
});

test('删除源文件后清理孤儿页面', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'a', '---\ntitle: A\n---\n正文');
  await writePost(root, 'gone', '---\ntitle: Gone\n---\n正文');
  await build(options(root));

  await rm(path.join(root, 'content', 'gone.md'));
  const result = await build(options(root));
  assert.deepEqual(result.removed, ['gone.html']);
  await assert.rejects(readFile(path.join(root, 'dist', 'gone.html')));
});

test('没有 front-matter 时用文件名当标题', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'plain-note', '只有正文');
  await build(options(root));
  const html = await readFile(path.join(root, 'dist', 'plain-note.html'), 'utf8');
  assert.match(html, /<title>plain-note · 测试站<\/title>/);
});

test('摘要自动截断', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'long', `---\ntitle: 长文\n---\n\n${'字'.repeat(400)}`);
  await build(options(root));
  const index = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(index, /…/);
});

test('tags 渲染成 span', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'tagged', '---\ntitle: T\ntags: [a, b]\n---\n正文');
  const result = await build(options(root));
  assert.equal(result.total, 1);
});

test('缺少布局文件时报错', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await rm(path.join(root, 'layouts', 'post.html'));
  await assert.rejects(build(options(root)));
});

test('缓存文件写在输出目录', async (t) => {
  const root = await makeProject();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writePost(root, 'a', '---\ntitle: A\n---\n正文');
  await build(options(root));
  const cache = JSON.parse(await readFile(path.join(root, 'dist', '.marklite-cache.json'), 'utf8'));
  assert.ok(cache['a.md'].hash);
  assert.equal(cache['a.md'].out, 'a.html');
});
