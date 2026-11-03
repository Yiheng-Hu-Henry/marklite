import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeHtml, inline, renderMarkdown, stripTags } from '../src/markdown.js';

test('标题渲染成带 id 的 h1-h6', () => {
  assert.equal(renderMarkdown('# 你好'), '<h1 id="你好">你好</h1>');
  assert.equal(renderMarkdown('### Third level'), '<h3 id="third-level">Third level</h3>');
  assert.match(renderMarkdown('###### 六级'), /^<h6 /);
});

test('段落与空行', () => {
  assert.equal(renderMarkdown('第一段\n\n第二段'), '<p>第一段</p>\n<p>第二段</p>');
});

test('行内代码优先于强调', () => {
  const html = renderMarkdown('用 `a * b * c` 表示乘法');
  assert.match(html, /<code>a \* b \* c<\/code>/);
  assert.doesNotMatch(html, /<em>/);
});

test('代码块保留内容并转义', () => {
  const html = renderMarkdown('```js\nconst a = 1 < 2;\n```');
  assert.match(html, /<pre><code class="language-js">/);
  assert.match(html, /1 &lt; 2/);
});

test('代码块里的 Markdown 不被解释', () => {
  const html = renderMarkdown('```\n# 不是标题\n**不是粗体**\n```');
  assert.doesNotMatch(html, /<h1/);
  assert.doesNotMatch(html, /<strong>/);
  assert.match(html, /# 不是标题/);
});

test('粗体、斜体、删除线', () => {
  const html = inline('**粗** 和 *斜* 和 ~~删~~');
  assert.match(html, /<strong>粗<\/strong>/);
  assert.match(html, /<em>斜<\/em>/);
  assert.match(html, /<del>删<\/del>/);
});

test('链接与图片', () => {
  assert.match(inline('[文档](https://example.com)'), /<a href="https:\/\/example.com">文档<\/a>/);
  assert.match(inline('![图](/a.png)'), /<img src="\/a.png" alt="图" loading="lazy">/);
});

test('链接里的引号被正确转义', () => {
  const html = inline('[x](/a?b=1&c=2)');
  assert.match(html, /href="\/a\?b=1&amp;c=2"/);
});

test('危险协议被替换成 #', () => {
  assert.match(inline('[点我](javascript:alert(1))'), /href="#"/);
  assert.match(inline('[点我](data:text/html;base64,xx)'), /href="#"/);
});

test('HTML 被转义，不会透传', () => {
  const html = inline('<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('无序列表与有序列表', () => {
  assert.equal(renderMarkdown('- a\n- b'), '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>');
  assert.equal(renderMarkdown('1. a\n2. b'), '<ol>\n  <li>a</li>\n  <li>b</li>\n</ol>');
});

test('列表遇到不同类型时停止', () => {
  const html = renderMarkdown('- a\n1. b');
  assert.match(html, /<ul>/);
  assert.match(html, /<ol>/);
});

test('任务列表渲染成 checkbox', () => {
  const html = renderMarkdown('- [x] 完成\n- [ ] 待办');
  assert.match(html, /checked/);
  assert.match(html, /disabled/);
});

test('列表续行并入同一项', () => {
  const html = renderMarkdown('- 第一行\n  第二行');
  assert.match(html, /<li>第一行<br>第二行<\/li>/);
});

test('引用递归解析内部 Markdown', () => {
  const html = renderMarkdown('> 引用里的 **重点**');
  assert.match(html, /<blockquote>/);
  assert.match(html, /<strong>重点<\/strong>/);
});

test('表格含对齐', () => {
  const html = renderMarkdown('| a | b |\n| :--- | ---: |\n| 1 | 2 |');
  assert.match(html, /<table>/);
  assert.match(html, /text-align:left/);
  assert.match(html, /text-align:right/);
  assert.match(html, /<td style="text-align:left">1<\/td>/);
});

test('表格缺列时补空单元格', () => {
  const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 |');
  assert.match(html, /<td[^>]*>1<\/td><td[^>]*><\/td>/);
});

test('水平线', () => {
  assert.equal(renderMarkdown('---'), '<hr>');
  assert.equal(renderMarkdown('***'), '<hr>');
});

test('两个空格结尾产生换行', () => {
  assert.match(inline('上  \n下'), /上<br>/);
});

test('stripTags 去掉标签与代码块', () => {
  const text = stripTags('<h1>标题</h1><p>正文<code>x</code></p><pre><code>code</code></pre>');
  assert.equal(text, '标题 正文 x');
});

test('escapeHtml 处理四个字符', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('空输入不报错', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown('\n\n\n'), '');
});
