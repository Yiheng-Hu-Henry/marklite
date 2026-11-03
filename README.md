# marklite

零依赖的 Markdown 静态站点生成器。`git clone` 完就能跑，不需要 `npm install`。

```bash
node bin/marklite.js build     # content/*.md -> dist/
node bin/marklite.js serve     # 起预览服务，改文件自动重建
```

## 它做什么

- **自写 Markdown 解析器**：标题、段落、粗斜体、删除线、行内代码、围栏代码块、引用、有序/无序/任务列表、表格（含对齐）、链接、图片、水平线
- **front-matter**：`title` / `date` / `tags` / `excerpt`，支持行内与块状数组
- **模板**：`{{title}}`、`{{site.title}}` 这样的变量替换，支持点号取嵌套字段
- **增量构建**：只重建真正变了的那几篇，删掉的文章会连带清理输出
- **开发服务器**：静态文件 + 文件变化自动重建 + 浏览器自动刷新

## 快速开始

```bash
git clone https://github.com/Yiheng-Hu-Henry/marklite.git
cd marklite
node bin/marklite.js serve --src example/content --layouts example/layouts --out example/dist
```

打开 http://localhost:4000 。仓库里带的 `example/` 就是一个能跑的博客，三篇文章分别演示语法支持、增量构建和依赖取舍。

## 目录约定

```
marklite.config.json    站点标题等配置
content/                *.md 源文件，文件名即 URL
layouts/post.html       文章页模板
layouts/index.html      首页模板
dist/                   输出（含 .marklite-cache.json）
```

文件名直接当 slug：`content/hello.md` → `dist/hello.html`。

## 命令

```bash
marklite build [--src content] [--out dist] [--layouts layouts] [--force]
marklite serve [--port 4000]
marklite clean
```

`--force` 忽略缓存全量重建。`serve` 会先构建一次，之后每 800 毫秒比较一次源文件
的 mtime，有变化就重建并从浏览器端轮询版本号自动刷新。

## front-matter

```yaml
---
title: 文章标题
date: 2026-11-03
tags: [工程, 工具]
excerpt: 首页列表里显示的摘要，不给就自动截取正文前 140 字
---
```

## 站点配置

```json
{
  "title": "我的博客",
  "description": "一句话介绍",
  "author": "你的名字"
}
```

模板里用 `{{site.title}}`、`{{site.description}}`、`{{site.author}}` 取。

## 模板变量

| 变量 | 用于 | 说明 |
| --- | --- | --- |
| `{{content}}` | 两个模板 | 文章正文 HTML / 首页文章列表 |
| `{{title}}` | post | 文章标题 |
| `{{date}}` | post | 日期字符串 |
| `{{readingTime}}` | post | 形如「3 分钟」 |
| `{{tags}}` | post | 已渲染成 `<span class="tag">` |
| `{{count}}` | index | 文章总数 |
| `{{year}}` | 两个 | 当前年份 |

## 设计说明

**增量靠一张哈希表。** 每篇的键是 `sha1(原文 + 布局内容)`。把布局也算进去是关键：
改一次模板，所有页面的哈希自动失效，不需要手动清缓存，也不会出现「改了模板但页面没变」
这种最难排查的问题。缓存文件放在 `dist/.marklite-cache.json`，删输出目录等于清缓存。

**模板故意不支持逻辑。** 没有 `if`、没有 `each`、没有过滤器。首页的文章列表是在
`site.js` 里拼好 HTML 再当成 `{{content}}` 传进去的。模板越简单，越不容易出现
「只有作者看得懂」的页面；需要逻辑就写 JS，别在模板里造一门小语言。

**用轮询而不是 `fs.watch`。** 后者在三大平台上的行为差异很大 —— 编辑器原子保存
（写临时文件再 rename）、网络盘、WSL 挂载都会漏事件。每 800 毫秒 stat 一次几个文件
的开销在这个场景里可以忽略，换来的是行为一致。

**转义是有意的，而且先抽行内代码再转义。** 渲染顺序是：先把 `` `code` `` 抽成占位符，
再转义 `& < > "`，再处理链接/强调，最后把代码放回去。这样代码里的 `*` 不会变成斜体，
`<script>` 也不会被透传成真的标签。链接还会挡掉 `javascript:` / `data:` 这类协议。

**中文排版不能被 `len()` 骗。** 生成文章摘要时按字符截断，但中文一个字占两列宽，
所以摘要长度用的是字符数不是显示宽度 —— 这部分刻意没有做「对齐」，因为网页端由
CSS 控制排版，不需要在生成阶段猜。

## 测试

```bash
node --test
```

53 个用例，覆盖解析器（含 XSS 与危险协议）、front-matter 边界、模板变量、
以及构建流程（增量命中、改布局全量重建、删除后清理孤儿、缓存结构）。

## 不支持

- 嵌套列表（只有一层）
- 脚注、定义列表、数学公式
- 代码高亮（代码块只有 `class="language-xx"`，样式自己写）
- RSS / sitemap
- HTML 块直通（需要的话直接写进模板）

这些都不是遗漏，是刻意的边界。要更完整的解析器，用 `unified`/`remark` 更合适。

## 许可

MIT
