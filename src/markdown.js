/**
 * 一个够用的 Markdown 解析器。
 *
 * 支持：标题、段落、围栏代码块、引用、有序/无序列表（含任务列表与续行）、
 * 表格、水平线、行内代码、粗体、斜体、删除线、链接、图片。
 *
 * 不支持（有意为之）：嵌套列表、脚注、HTML 块、数学公式。要这些就换用
 * unified/remark —— 这个项目的目标是零依赖。
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ESCAPES[ch]);
}

/** 挡掉 javascript: / data: 这类危险协议。 */
function safeUrl(url) {
  const trimmed = String(url).trim();
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) return '#';
  return trimmed;
}

/**
 * 行内元素。
 *
 * 先把行内代码抓出来占位，避免代码里的 `*` `_` 被当成强调标记；
 * 其余替换完成后按原样塞回去。
 */
export function inline(text) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (_match, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = escapeHtml(out);

  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_match, alt, src, title) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${safeUrl(src)}" alt="${alt}"${titleAttr} loading="lazy">`;
    }
  );

  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_match, label, href, title) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${safeUrl(href)}"${titleAttr}>${label}</a>`;
    }
  );

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');

  out = out.replace(/ {2,}\n/g, '<br>\n');

  return out.replace(/\u0000(\d+)\u0000/g, (_match, index) => codes[Number(index)]);
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(\s*)```(\S*)\s*$/;
const HR_RE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;
const LIST_RE = /^( {0,3})([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map((cell) => cell.trim());
}

function renderHeading(match) {
  const level = match[1].length;
  const text = inline(match[2].trim());
  const id = match[2]
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
  return `<h${level} id="${id}">${text}</h${level}>`;
}

function renderList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const ordered = /\d/.test(first[2]);
  const items = [];
  let index = start;

  while (index < lines.length) {
    const match = lines[index].match(LIST_RE);
    if (match) {
      if (/\d/.test(match[2]) !== ordered) break;
      items.push(match[3]);
      index += 1;
      continue;
    }
    const line = lines[index];
    if (!line.trim()) {
      const next = lines[index + 1];
      if (next && /^\s{2,}\S/.test(next) && items.length) {
        items[items.length - 1] += '\n';
        index += 1;
        continue;
      }
      break;
    }
    if (/^\s{2,}\S/.test(line) && items.length) {
      items[items.length - 1] += `\n${line.trim()}`;
      index += 1;
      continue;
    }
    break;
  }

  const tag = ordered ? 'ol' : 'ul';
  const body = items
    .map((item) => {
      const task = item.match(/^\[([ xX])\]\s+([\s\S]*)$/);
      if (task) {
        const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
        return `  <li class="task"><input type="checkbox" disabled${checked}> ${inline(
          task[2].trim()
        )}</li>`;
      }
      const lines2 = item.split('\n');
      const head = inline(lines2[0]);
      if (lines2.length === 1) return `  <li>${head}</li>`;
      const rest = lines2.slice(1).map((part) => inline(part)).join('<br>');
      return `  <li>${head}<br>${rest}</li>`;
    })
    .join('\n');

  return { html: `<${tag}>\n${body}\n</${tag}>`, next: index };
}

function renderTable(lines, start) {
  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const trimmed = cell.trim();
    if (/^:-+:$/.test(trimmed)) return 'center';
    if (/^-+:$/.test(trimmed)) return 'right';
    if (/^:-+$/.test(trimmed)) return 'left';
    return '';
  });

  const rows = [];
  let index = start + 2;
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    rows.push(splitRow(lines[index]));
    index += 1;
  }

  const alignAttr = (column) =>
    aligns[column] ? ` style="text-align:${aligns[column]}"` : '';

  const head = header
    .map((cell, column) => `<th${alignAttr(column)}>${inline(cell)}</th>`)
    .join('');

  const body = rows
    .map((row) => {
      const cells = header.map(
        (_, column) => `<td${alignAttr(column)}>${inline(row[column] ?? '')}</td>`
      );
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('\n');

  return {
    html: `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`,
    next: index,
  };
}

function renderCodeFence(lines, start) {
  const match = lines[start].match(FENCE_RE);
  const language = match[2] || '';
  const body = [];
  let index = start + 1;
  while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
    body.push(lines[index]);
    index += 1;
  }
  const className = language ? ` class="language-${escapeHtml(language)}"` : '';
  return {
    html: `<pre><code${className}>${escapeHtml(body.join('\n'))}</code></pre>`,
    next: index + 1,
  };
}

function renderQuote(lines, start) {
  const body = [];
  let index = start;
  while (index < lines.length) {
    const match = lines[index].match(QUOTE_RE);
    if (!match) break;
    body.push(match[1]);
    index += 1;
  }
  return {
    html: `<blockquote>\n${renderMarkdown(body.join('\n'))}\n</blockquote>`,
    next: index,
  };
}

/** 从第 start 行开始的连续普通文本。 */
function renderParagraph(lines, start) {
  const body = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) break;
    if (
      FENCE_RE.test(line) ||
      HEADING_RE.test(line) ||
      HR_RE.test(line) ||
      LIST_RE.test(line) ||
      QUOTE_RE.test(line)
    ) {
      break;
    }
    body.push(line.trim());
    index += 1;
  }
  return { html: `<p>${inline(body.join('\n'))}</p>`, next: index };
}

/**
 * 把 Markdown 渲染成 HTML 片段。
 * @param {string} source
 * @returns {string}
 */
export function renderMarkdown(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (FENCE_RE.test(line)) {
      const result = renderCodeFence(lines, index);
      blocks.push(result.html);
      index = result.next;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push(renderHeading(heading));
      index += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const result = renderQuote(lines, index);
      blocks.push(result.html);
      index = result.next;
      continue;
    }

    if (LIST_RE.test(line)) {
      const result = renderList(lines, index);
      blocks.push(result.html);
      index = result.next;
      continue;
    }

    if (line.includes('|') && TABLE_DIVIDER_RE.test(lines[index + 1] || '')) {
      const result = renderTable(lines, index);
      blocks.push(result.html);
      index = result.next;
      continue;
    }

    const result = renderParagraph(lines, index);
    blocks.push(result.html);
    index = result.next;
  }

  return blocks.join('\n');
}

/** 提取纯文本，用于生成摘要或阅读时长。 */
export function stripTags(html) {
  return String(html)
    .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
