import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { htmlText, validateArticle } from './common.mjs';
import { validateTopics } from './validate-pr.mjs';
import { importArticle } from './import-wordpress.mjs';

const site = {
  siteId: 'demo', enabled: true, url: 'https://blog.example.com', restBase: 'https://blog.example.com/wp-json/wp/v2/',
  timezone: 'Asia/Shanghai', status: 'draft', mergeMode: 'manual', minimumCharacters: 4, maximumCharacters: 2000,
  categories: [], tags: [], credentials: { usernameEnv: 'WP_USER', passwordEnv: 'WP_PASS' }
};
const article = {
  siteId: 'demo', date: '2026-10-04', topicId: 't1', title: '实际用户问题', slug: 'test-topic', excerpt: '简短摘要',
  content: '<p>这是用于验证的自写示例。</p>', source: 'codex-scheduled-task'
};
const file = 'automation/blog-inbox/demo/2026-10-04-test-topic.json';
const env = { WP_USER: 'writer', WP_PASS: 'test-password-not-real' };
const response = body => ({ ok: true, status: 200, json: async () => body });
const post = { id: 12, slug: article.slug, status: 'draft', title: { raw: article.title }, excerpt: { raw: article.excerpt }, content: { raw: article.content }, link: 'https://blog.example.com/?p=12' };

test('article rejects hidden status overrides and unsafe HTML links', () => {
  assert.ok(validateArticle(article, site, file).length >= 4);
  assert.throws(() => validateArticle({ ...article, status: 'publish' }, site, file));
  assert.throws(() => htmlText('<p><a href="java&#115;cript:alert(1)">点此</a></p>'));
  assert.throws(() => htmlText('<p onclick="x()">文字</p>'));
  assert.equal(htmlText('<p>甲&amp;乙</p><p>丙</p>'), '甲&乙 丙');
});

test('topic transition retains history and rejects an unrelated rewrite', () => {
  const before = [{ id: 't1', title: '原题', status: 'pending', extra: 42 }, { id: 'old', status: 'used', usedAt: '2026-10-01' }];
  const after = [{ ...before[0], status: 'used', usedAt: article.date, articleSlug: article.slug }, before[1]];
  validateTopics(before, after, article);
  assert.throws(() => validateTopics(before, [{ ...after[0], extra: 43 }, after[1]], article));
});

test('new article POST remains draft and selects only configured credentials', async () => {
  const calls = [];
  const result = await importArticle(article, site, { env, fetchImpl: async (url, opts) => {
    calls.push({ url, opts });
    return response(opts.method === 'POST' ? post : []);
  } });
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].opts.body).status, 'draft');
  assert.equal(calls[0].opts.redirect, 'error');
  assert.equal(result.status, 'draft');
  assert.equal(result.reused, false);
});

test('an existing identical article is reused without POST', async () => {
  let count = 0;
  const result = await importArticle(article, site, { env, fetchImpl: async () => { count++; return response([post]); } });
  assert.equal(count, 1);
  assert.equal(result.reused, true);
});

test('slug collision, disabled site and lookup failure cannot write', async () => {
  let writes = 0;
  await assert.rejects(importArticle(article, site, { env, fetchImpl: async (_, opts) => {
    if (opts.method === 'POST') writes++;
    return response([{ ...post, content: { raw: '他人文章' } }]);
  } }));
  await assert.rejects(importArticle(article, { ...site, enabled: false }, { env, fetchImpl: async () => { writes++; return response([]); } }));
  await assert.rejects(importArticle(article, site, { env, fetchImpl: async () => { throw new Error('offline'); } }));
  assert.equal(writes, 0);
});

test('lost POST response is not retried', async () => {
  let calls = 0;
  await assert.rejects(importArticle(article, site, { env, fetchImpl: async (_, opts) => {
    calls++;
    if (opts.method === 'POST') throw new Error('response lost');
    return response([]);
  } }));
  assert.equal(calls, 2);
});

test('real git PR scope accepts one article and rejects mixed code or a second date', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wp-blog-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (path, value) => { const full = join(dir, path); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, JSON.stringify(value)); };
  git('init'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  put('sites/demo.json', site);
  put('automation/topics/demo.json', [{ id: 't1', status: 'pending', title: '原题' }]);
  git('add', '.'); git('commit', '-m', 'base'); const base = git('rev-parse', 'HEAD');
  put(file, article);
  put('automation/topics/demo.json', [{ id: 't1', status: 'used', title: '原题', usedAt: article.date, articleSlug: article.slug }]);
  git('add', '.'); git('commit', '-m', 'article'); const head = git('rev-parse', 'HEAD');
  const script = new URL('./validate-pr.mjs', import.meta.url);
  const run = (b, h) => execFileSync(process.execPath, [fileURLToPath(script), b, h], { cwd: dir, encoding: 'utf8', env: { ...process.env, PR_CREATED_AT: '2026-10-04T02:00:00Z' } });
  assert.equal(JSON.parse(run(base, head)).kind, 'article');
  put('unrelated.json', { code: 'changed' }); git('add', '.'); git('commit', '-m', 'mixed');
  assert.throws(() => run(base, git('rev-parse', 'HEAD')));
  const topics = [{ id: 't1', status: 'used', title: '原题', usedAt: article.date, articleSlug: article.slug }, { id: 't2', status: 'pending', title: '第二题' }];
  put('automation/topics/demo.json', topics); git('add', '.'); git('commit', '-m', 'next base'); const nextBase = git('rev-parse', 'HEAD');
  const second = { ...article, title: '不同标题', slug: 'second-topic', topicId: 't2' };
  put('automation/blog-inbox/demo/2026-10-04-second-topic.json', second);
  put('automation/topics/demo.json', [topics[0], { ...topics[1], status: 'used', usedAt: article.date, articleSlug: second.slug }]);
  git('add', '.'); git('commit', '-m', 'duplicate date');
  assert.throws(() => run(nextBase, git('rev-parse', 'HEAD')));
});
