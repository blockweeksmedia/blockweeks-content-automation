import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assert, loadSite, validateArticle } from './common.mjs';

function git(...args) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
function readAt(ref, path) { return JSON.parse(git('show', `${ref}:${path}`).replace(/^\uFEFF/, '')); }

export function validateTopics(before, after, article) {
  assert(Array.isArray(before) && Array.isArray(after) && after.length >= before.length, 'Topic list must preserve history');
  let used = 0;
  const ids = new Set();
  for (let i = 0; i < after.length; i++) {
    const topic = after[i];
    assert(topic && typeof topic.id === 'string' && topic.id.length > 0 && !ids.has(topic.id), 'Topic IDs must be unique');
    ids.add(topic.id);
    if (i >= before.length) { assert(topic.status === 'pending' && !topic.usedAt && !topic.articleSlug, 'New topics must be pending'); continue; }
    if (isDeepStrictEqual(before[i], topic)) continue;
    const expected = { ...before[i], status: 'used', usedAt: article.date, articleSlug: article.slug };
    if (Object.hasOwn(topic, 'articleTitle')) expected.articleTitle = article.title;
    assert(before[i].status === 'pending' && before[i].id === article.topicId && isDeepStrictEqual(expected, topic), 'Only the selected pending topic may change');
    used++;
  }
  assert(used === 1, 'Exactly one pending topic must be marked used');
}

export function validatePR(base, head) {
  for (const sha of [base, head]) assert(/^[0-9a-f]{40}$/.test(sha), 'Use complete commit SHAs');
  const files = git('diff', '--name-status', '--no-renames', base, head).trim().split('\n').filter(Boolean).map(x => x.split('\t'));
  const posts = files.filter(([, p]) => p.startsWith('automation/blog-inbox/'));
  if (!posts.length) return { kind: 'configuration', articleAutoMergeEligible: false, note: 'Human configuration review required' };
  assert(posts.length === 1 && posts[0][0] === 'A', 'Exactly one new article is allowed; old articles cannot change');
  const file = posts[0][1], a = readAt(head, file), site = loadSite(a.siteId, path => readAt(base, path));
  assert(site.enabled === true, 'Site is disabled; finish onboarding before article PRs');
  validateArticle(a, site, file);
  const topicsPath = `automation/topics/${a.siteId}.json`;
  assert(files.length === 2 && files.some(([s, p]) => s === 'M' && p === topicsPath), 'Article PR may only add one article and modify its topic table');
  validateTopics(readAt(base, topicsPath), readAt(head, topicsPath), a);
  for (const path of git('ls-tree', '-r', '--name-only', base, '--', `automation/blog-inbox/${a.siteId}/`).trim().split('\n').filter(Boolean)) {
    if (!path.endsWith('.json')) continue;
    const old = readAt(base, path);
    assert(old.slug !== a.slug && old.title.trim().toLowerCase() !== a.title.trim().toLowerCase(), 'Duplicate article title or slug');
    if (site.adapter && old.sources) {
      const canonical = value => { const u = new URL(value); u.hash = ''; return u.href.replace(/\/$/, ''); };
      const urls = new Set(old.sources.filter(s => ['x', 'reddit'].includes(s.kind)).map(s => canonical(s.url)));
      assert(!a.sources.some(s => ['x', 'reddit'].includes(s.kind) && urls.has(canonical(s.url))), 'This channel already used this discussion source');
    }
    assert(old.date !== a.date, 'This site already has an article for this date');
  }
  if (process.env.PR_CREATED_AT) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(process.env.PR_CREATED_AT));
    assert(a.date === date, 'Article date must match PR creation date in the site timezone');
  }
  return { kind: 'article', articleAutoMergeEligible: ['checked', 'protected'].includes(site.mergeMode), siteId: a.siteId, file };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(validatePR(process.argv[2], process.argv[3]))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
