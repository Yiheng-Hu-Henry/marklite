import assert from 'node:assert/strict';
import test from 'node:test';

import { findMissingVars, renderTemplate } from '../src/template.js';

test('替换简单变量', () => {
  assert.equal(renderTemplate('你好，{{name}}！', { name: '世界' }), '你好，世界！');
});

test('容忍花括号里的空格', () => {
  assert.equal(renderTemplate('{{ name }}', { name: 'x' }), 'x');
  assert.equal(renderTemplate('{{  name  }}', { name: 'x' }), 'x');
});

test('嵌套取值', () => {
  const vars = { site: { title: '博客', description: '描述' } };
  assert.equal(renderTemplate('{{site.title}}', vars), '博客');
  assert.equal(renderTemplate('{{site.description}}', vars), '描述');
});

test('缺失变量渲染成空串', () => {
  assert.equal(renderTemplate('a{{nope}}b', {}), 'ab');
  assert.equal(renderTemplate('{{site.nope}}', { site: {} }), '');
});

test('null 与 undefined 都当空', () => {
  assert.equal(renderTemplate('[{{a}}][{{b}}]', { a: null, b: undefined }), '[][]');
});

test('零和 false 会被保留', () => {
  assert.equal(renderTemplate('{{a}}/{{b}}', { a: 0, b: false }), '0/false');
});

test('HTML 内容原样插入', () => {
  assert.equal(renderTemplate('{{content}}', { content: '<p>x</p>' }), '<p>x</p>');
});

test('多个变量一次替换', () => {
  assert.equal(
    renderTemplate('{{a}}-{{b}}-{{a}}', { a: '1', b: '2' }),
    '1-2-1'
  );
});

test('findMissingVars 找出未提供的键', () => {
  const missing = findMissingVars('{{a}}{{b}}{{site.title}}', { a: '1', site: {} });
  assert.deepEqual(missing.sort(), ['b', 'site.title']);
});

test('findMissingVars 在变量齐全时返回空数组', () => {
  assert.deepEqual(findMissingVars('{{a}}', { a: 1 }), []);
});
