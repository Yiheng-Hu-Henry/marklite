/**
 * 模板渲染。
 *
 * 只有一件事：把 `{{ key }}` 换成值。支持点号取嵌套字段（`{{site.title}}`）。
 * 故意不做条件、循环、过滤器 —— 需要逻辑就写在 site.js 里，把结果当变量传进来。
 * 模板越简单，越不容易写出只有作者看得懂的页面。
 */

function lookup(vars, path) {
  return String(path)
    .split('.')
    .reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      return current[key];
    }, vars);
}

/**
 * @param {string} template
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
export function renderTemplate(template, vars) {
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const value = lookup(vars, key);
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

/** 找出模板里用到但没给值的变量，用于在构建时报错。 */
export function findMissingVars(template, vars) {
  const missing = new Set();
  const pattern = /\{\{\s*([\w.]+)\s*\}\}/g;
  let match = pattern.exec(String(template));
  while (match) {
    const value = lookup(vars, match[1]);
    if (value === undefined) missing.add(match[1]);
    match = pattern.exec(String(template));
  }
  return [...missing];
}
