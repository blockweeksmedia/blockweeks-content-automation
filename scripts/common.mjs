import { validateChannelConfig, validateChannelArticle } from './channel-validation.mjs';
import { readFileSync } from 'node:fs';

export function assert(ok, message) {
  if (!ok) throw new Error(message);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

export function validateSite(site) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site.siteId), 'Invalid siteId');
  const url = new URL(site.url), rest = new URL(site.restBase);
  for (const u of [url, rest]) {
    assert(u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash, 'Site URL must be HTTPS without credentials, query or fragment');
  }
  assert(rest.origin === url.origin && rest.pathname.endsWith('/'), 'REST base must share the site origin and end in /');
  assert(['draft', 'publish'].includes(site.status), 'Unsupported WordPress status');
  assert(['manual', 'checked', 'protected'].includes(site.mergeMode), 'Unsupported mergeMode');
  new Intl.DateTimeFormat('en', { timeZone: site.timezone });
  assert(Number.isInteger(site.minimumCharacters) && site.minimumCharacters >= 1, 'Invalid minimumCharacters');
  assert(Number.isInteger(site.maximumCharacters) && site.maximumCharacters >= site.minimumCharacters, 'Invalid maximumCharacters');
  for (const field of ['categories', 'tags']) {
    assert(Array.isArray(site[field]) && site[field].every(x => Number.isInteger(x) && x > 0), `Invalid ${field} IDs`);
  }
  for (const field of ['usernameEnv', 'passwordEnv']) {
    assert(/^[A-Z][A-Z0-9_]+$/.test(site.credentials?.[field] ?? ''), `Invalid ${field}`);
  }
  if (site.adapter) validateChannelConfig(site);
  return site;
}

export function loadSite(id, read = readJson) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 'Invalid siteId');
  const site = validateSite(read(`sites/${id}.json`));
  assert(site.siteId === id, 'Site ID does not match its file');
  return site;
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()];
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    assert(n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff), 'Invalid HTML entity');
    return String.fromCodePoint(n);
  });
}

export function htmlText(html) {
  const allowed = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'code', 'a', 'br']);
  const stack = [];
  let pos = 0, plain = '';
  for (const match of html.matchAll(/<[^>]*>/g)) {
    const gap = html.slice(pos, match.index);
    assert(!/[<>]/.test(gap), 'Malformed HTML');
    plain += gap;
    const tag = /^<(\/)?([a-z0-9]+)([^>]*)>$/i.exec(match[0]);
    assert(tag, 'Unsupported HTML construct');
    const [, closing, rawName, attrs] = tag, name = rawName.toLowerCase();
    assert(allowed.has(name), `Unsupported HTML tag: ${name}`);
    if (closing) {
      assert(!attrs.trim() && name !== 'br' && stack.pop() === name, 'Unbalanced HTML');
    } else {
      if (name === 'a') {
        const a = /^\s+href="([^"<>]*)"\s*$/.exec(attrs);
        assert(a, 'Links require only a double-quoted href');
        const href = decodeEntities(a[1]);
        assert(!/[\u0000-\u0020\u007f\\]/.test(href), 'Unsafe link characters');
        const u = new URL(href);
        assert(['https:', 'http:', 'mailto:'].includes(u.protocol) && !u.username && !u.password, 'Unsafe link protocol');
      } else {
        assert(!attrs.trim() || (name === 'br' && attrs.trim() === '/'), 'Unsupported HTML attributes');
      }
      if (name !== 'br') stack.push(name);
    }
    if (['p', 'h2', 'h3', 'li', 'blockquote', 'br'].includes(name)) plain += '\n';
    pos = match.index + match[0].length;
  }
  const tail = html.slice(pos);
  assert(!/[<>]/.test(tail) && stack.length === 0, 'Unbalanced HTML');
  return decodeEntities(plain + tail).replace(/\s+/g, ' ').trim();
}

export function validateArticle(article, site, file) {
  validateSite(site);
  const required = ['siteId', 'date', 'topicId', 'title', 'slug', 'excerpt', 'content', 'source'];
  const allowed = new Set([...required, 'seoTitle', 'seoDescription', ...(site.adapter ? ['categoryIds', 'tagIds', 'sources', 'event', 'featuredMediaId'] : [])]);
  assert(article && typeof article === 'object' && !Array.isArray(article), 'Article must be an object');
  assert(Object.keys(article).every(x => allowed.has(x)), 'Unknown article field');
  for (const key of required) assert(typeof article[key] === 'string' && article[key].trim().length > 0, `Missing ${key}`);
  for (const key of ['seoTitle', 'seoDescription']) {
    assert(article[key] === undefined || typeof article[key] === 'string', `Invalid ${key}`);
  }
  assert(article.siteId === site.siteId, 'Article site mismatch');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(article.date) && new Date(`${article.date}T00:00:00Z`).toISOString().slice(0, 10) === article.date, 'Invalid article date');
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug), 'Invalid slug');
  assert(article.source === 'codex-scheduled-task', 'Invalid article source');
  const expected = `automation/blog-inbox/${article.siteId}/${article.date}-${article.slug}.json`;
  assert(file === expected, `Expected article path: ${expected}`);
  for (const [key, max] of Object.entries({ title: 180, slug: 160, topicId: 120, excerpt: 500, content: 120000, seoTitle: 180, seoDescription: 320 })) {
    assert((article[key]?.length ?? 0) <= max, `${key} exceeds ${max} UTF-16 units`);
  }
  assert(!/[<>]/.test(article.title + article.excerpt), 'Title and excerpt must be plain text');
  const length = htmlText(article.content).length;
  assert(length >= site.minimumCharacters && length <= site.maximumCharacters, `Content length ${length} outside ${site.minimumCharacters}..${site.maximumCharacters}`);
  if (site.adapter) validateChannelArticle(article, site);
  return { article, site, length };
}
