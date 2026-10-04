import { importChannel } from './channel-adapters.mjs';
import { pathToFileURL } from 'node:url';
import { assert, readJson, loadSite, validateArticle } from './common.mjs';

export async function importArticle(article, site, { fetchImpl = fetch, env = process.env } = {}) {
  const file = `automation/blog-inbox/${article.siteId}/${article.date}-${article.slug}.json`;
  validateArticle(article, site, file);
  assert(site.enabled === true, 'Site disabled; no request made');
  const username = env[site.credentials.usernameEnv], password = env[site.credentials.passwordEnv];
  assert(username && password && !username.includes(':'), 'Missing or invalid WordPress credentials');
  const headers = { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`, 'Content-Type': 'application/json' };
  async function request(url, options = {}) {
    let response;
    try { response = await fetchImpl(url, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('WordPress connection failed or timed out. Verify the final REST URL and existing slug before retrying.'); }
    let data;
    try { data = await response.json(); } catch { throw new Error(`WordPress returned non-JSON (HTTP ${response.status}); verify existing slug before retrying.`); }
    assert(response.ok, `WordPress HTTP ${response.status}; code=${typeof data.code === 'string' ? data.code.replace(/[^a-z0-9_-]/gi, '') : 'unknown'}`);
    return data;
  }
  if (site.adapter) return importChannel(article, site, request);
  const posts = new URL('posts', site.restBase);
  const query = new URL(posts);
  query.searchParams.set('slug', article.slug);
  query.searchParams.set('context', 'edit');
  query.searchParams.set('status', 'any');
  query.searchParams.set('per_page', '100');
  const existing = await request(query);
  assert(Array.isArray(existing), 'WordPress lookup did not return a post array');
  const matches = existing.filter(p => p.slug === article.slug);
  assert(matches.length <= 1, 'Multiple posts have the requested slug; inspect manually');
  if (matches.length) {
    const p = matches[0];
    assert(p.title?.raw === article.title && p.content?.raw === article.content && p.excerpt?.raw === article.excerpt, 'Existing slug has different content; no overwrite or new post was attempted');
    return { ok: true, reused: true, id: p.id, slug: p.slug, status: p.status, link: p.link };
  }
  // A lost POST response is intentionally not retried automatically.
  const p = await request(posts, { method: 'POST', body: JSON.stringify({
    title: article.title, slug: article.slug, content: article.content, excerpt: article.excerpt,
    status: site.status, categories: site.categories, tags: site.tags
  }) });
  assert(Number.isInteger(p.id) && p.slug === article.slug && p.status === site.status, 'WordPress created an unexpected slug or status; inspect returned post before retrying');
  // Do not assume published content remains public; report the response status.
  return { ok: true, reused: false, id: p.id, slug: p.slug, status: p.status, link: p.link };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const file = process.argv[2];
    assert(/^automation\/blog-inbox\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.json$/.test(file ?? ''), 'Provide a repository article path');
    const article = readJson(file), site = loadSite(article.siteId);
    validateArticle(article, site, file);
    const env = { ...process.env };
    // The Actions matrix selects only this site's two secrets.
    if (process.env.WP_USERNAME_VALUE) env[site.credentials.usernameEnv] = process.env.WP_USERNAME_VALUE;
    if (process.env.WP_PASSWORD_VALUE) env[site.credentials.passwordEnv] = process.env.WP_PASSWORD_VALUE;
    console.log(JSON.stringify(await importArticle(article, site, { env })));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
