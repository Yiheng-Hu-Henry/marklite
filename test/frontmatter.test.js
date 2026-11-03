import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFrontmatter } from '../src/frontmatter.js';

test('没有 front-matter 时原样返回', () => {
  const { data, content } = parseFrontmatter('# 标题\n正文');
  assert.deepEqual(data, {});
  assert.equal(content, '# 标题\n正文');
});

test('解析基本键值', () => {
  const { data, content } = parseFrontmatter('---\ntitle: 你好\ndate: 2026-11-03\n---\n正文');
  assert.equal(data.title, '你好');
  assert.equal(data.date, '2026-11-03');
  assert.equal(content, '正文');
});

test('行内数组', () => {
  const { data } = parseFrontmatter('---\ntags: [a, b, c]\n---\n');
  assert.deepEqual(data.tags, ['a', 'b', 'c']);
});

test('块状数组', () => {
  const { data } = parseFrontmatter('---\ntags:\n  - 前端\n  - 构建\n---\n');
  assert.deepEqual(data.tags, ['前端', '构建']);
});

test('引号被去掉', () => {
  const { data } = parseFrontmatter('---\ntitle: "带: 冒号的标题"\n---\n');
  assert.equal(data.title, '带: 冒号的标题');
});

test('布尔、数字与 null', () => {
  const { data } = parseFrontmatter('---\ndraft: true\nweight: 3\ncover: null\n---\n');
  assert.equal(data.draft, true);
  assert.equal(data.weight, 3);
  assert.equal(data.cover, null);
});

test('注释行被忽略', () => {
  const { data } = parseFrontmatter('---\n# 这是注释\ntitle: x\n---\n');
  assert.deepEqual(data, { title: 'x' });
});

test('CRLF 换行也能解析', () => {
  const { data, content } = parseFrontmatter('---\r\ntitle: windows\r\n---\r\n正文');
  assert.equal(data.title, 'windows');
  assert.equal(content, '正文');
});

test('空 front-matter', () => {
  const { data, content } = parseFrontmatter('---\n---\n正文');
  assert.deepEqual(data, {});
  assert.equal(content, '正文');
});

test('缺少收尾分隔符时按无 front-matter 处理', () => {
  const { data, content } = parseFrontmatter('---\ntitle: x\n正文');
  assert.deepEqual(data, {});
  assert.equal(content, '---\ntitle: x\n正文');
});
