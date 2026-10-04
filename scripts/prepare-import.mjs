import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { assert, readJson, loadSite, validateArticle } from './common.mjs';

try {
  const [base, head] = process.argv.slice(2);
  for (const sha of [base, head]) assert(/^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha), 'Import requires existing base/head commits; first repository push only installs the template');
  const rows = execFileSync('git', ['diff', '--name-status', '--no-renames', base, head, '--', 'automation/blog-inbox/'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(x => x.split('\t'));
  const include = [];
  for (const [status, file] of rows) {
    assert(status === 'A', 'Old articles must not be edited or removed through an import push');
    const article = readJson(file), site = loadSite(article.siteId);
    validateArticle(article, site, file);
    assert(site.enabled === true, 'Cannot import into a disabled site');
    assert(!include.some(x => x.siteId === site.siteId), 'Only one new article per site per push; split merges');
    include.push({ file, siteId: site.siteId, importGroup: site.importGroup ?? site.siteId, usernameEnv: site.credentials.usernameEnv, passwordEnv: site.credentials.passwordEnv });
  }
  assert(include.length <= 20, 'Import matrix is too large');
  const matrix = JSON.stringify({ include });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\nhas_articles=${include.length > 0}\n`);
  console.log(JSON.stringify({ articles: include.map(x => x.file) }));
} catch (e) { console.error(e.message); process.exitCode = 1; }
