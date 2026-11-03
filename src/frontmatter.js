/**
 * front-matter 解析。
 *
 * 只认 YAML 的一个很小的子集：`key: value`、`key: [a, b]`、引号字符串、
 * 布尔/null，以及 `key:` 后面跟 `- item` 的块状数组。够写博客元数据，
 * 也不至于为了几十行元数据引一个 YAML 库。
 */

function unquote(text) {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseValue(raw) {
  const value = String(raw).trim();
  if (!value) return '';
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item))
      .filter((item) => item !== '');
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  return unquote(value);
}

function parseBlock(block) {
  const data = {};
  const lines = block.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) {
      index += 1;
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
    if (!match) {
      index += 1;
      continue;
    }
    const key = match[1];
    const rest = match[2];

    if (rest.trim()) {
      data[key] = parseValue(rest);
      index += 1;
      continue;
    }

    const items = [];
    let cursor = index + 1;
    while (cursor < lines.length && /^\s*-\s+/.test(lines[cursor])) {
      items.push(parseValue(lines[cursor].replace(/^\s*-\s+/, '')));
      cursor += 1;
    }
    data[key] = items.length > 0 ? items : '';
    index = items.length > 0 ? cursor : index + 1;
  }

  return data;
}

/**
 * 拆分 front-matter 与正文。
 * @param {string} raw
 * @returns {{ data: Record<string, unknown>, content: string }}
 */
export function parseFrontmatter(raw) {
  const text = String(raw).replace(/\r\n?/g, '\n');
  // 中间那段允许为空（`---\n---\n` 这种空 front-matter）
  const match = text.match(/^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/);
  if (!match) {
    return { data: {}, content: text };
  }
  return { data: parseBlock(match[1] ?? ''), content: text.slice(match[0].length) };
}
