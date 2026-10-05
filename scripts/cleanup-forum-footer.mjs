import { pathToFileURL } from 'node:url';
import { assert, readJson } from './common.mjs';
import { verifyWPPost } from './channel-adapters.mjs';

// One explicitly requested correction; original inbox stays an immutable audit record.
export const targetFile = 'automation/blog-inbox/blockweeks-forum/2026-10-05-noncustodial-staking-incident-disclosure.json';
export const footer = '<p><a href="https://www.reddit.com/r/ethereum/comments/1wuqooj/comment/pd5foj9/">英文讨论原帖</a>（10月1日讨论串；10月5日核对）。</p>';
export async function cleanupForumFooter(original, site, request) {
  assert(original.siteId === 'blockweeks-forum' && original.slug === 'noncustodial-staking-incident-disclosure', 'Unexpected correction target');
  assert(site.status === 'draft' && site.collection === 'qa_post', 'Draft forum configuration required');
  assert(original.content.endsWith(footer), 'Expected exact footer missing');
  const corrected = { ...original, content: original.content.slice(0, -footer.length) };
  const query = new URL('qa_post', site.restBase);
  for (const [key,value] of Object.entries({slug:original.slug,context:'edit',status:'any',per_page:'100'})) query.searchParams.set(key,value);
  const rows = await request(query);
  assert(Array.isArray(rows) && rows.length === 1, 'Expected exactly one existing forum draft; no creation allowed');
  const post = rows[0];
  if (post.content?.raw !== original.content && post.content?.raw !== corrected.content) {
    const normalize = value => typeof value === 'string' ? value.replace(/\\s+/g,'') : null;
    console.error(JSON.stringify({diagnostic:'forum-footer-content-difference',id:post.id,status:post.status,contentKeys:Object.keys(post.content??{}),rawLength:post.content?.raw?.length,originalLength:original.content.length,endsWithExactFooter:post.content?.raw?.trimEnd().endsWith(footer),sameIgnoringWhitespace:normalize(post.content?.raw)===normalize(original.content),alreadyCleanIgnoringWhitespace:normalize(post.content?.raw)===normalize(corrected.content)}));
  }
  assert(post.content?.raw === original.content || post.content?.raw === corrected.content, 'Content changed externally; refuse overwrite');
  verifyWPPost(post, { ...original, content: post.content.raw }, site);
  const target = new URL(`qa_post/${post.id}`, site.restBase);
  const readbackURL = new URL(target); readbackURL.searchParams.set('context','edit');
  const fresh = await request(readbackURL);
  assert(fresh.content?.raw === post.content.raw, 'Draft changed during lookup; refuse overwrite');
  verifyWPPost(fresh, { ...original, content: fresh.content.raw }, site);
  const reused = fresh.content.raw === corrected.content;
  if (!reused) await request(target, {method:'POST',body:JSON.stringify({content:corrected.content})});
  const after = await request(readbackURL);
  verifyWPPost(after, corrected, site);
  return {ok:true,verified:true,id:after.id,slug:after.slug,status:after.status,reused,removedFooter:true};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const original = readJson(targetFile), site = readJson('sites/blockweeks-forum.json');
    const username = process.env.WP_USERNAME_VALUE, password = process.env.WP_PASSWORD_VALUE;
    assert(username && password && !username.includes(':'), 'Missing credentials');
    const headers = {Authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,'Content-Type':'application/json'};
    const request = async (url, options={}) => {
      assert(new URL(url).origin === 'https://blockweeks.com', 'Unexpected host');
      const response = await fetch(url, {...options,headers,redirect:'error',signal:AbortSignal.timeout(30000)});
      assert(response.ok, `WordPress HTTP ${response.status}`);
      return response.json();
    };
    console.log(JSON.stringify(await cleanupForumFooter(original,site,request)));
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
