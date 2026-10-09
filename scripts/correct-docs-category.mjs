import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { assert, readJson } from './common.mjs';

export async function correctDocsCategory(site, request) {
  assert(site.siteId === 'blockweeks-docs' && site.collection === 'docs' && site.categoryField === 'doc_category', 'Unexpected site configuration');
  const url = new URL('docs/329069', site.restBase);
  const readURL = new URL(url); readURL.searchParams.set('context','edit');
  const valid = post => {
    assert(post.id === 329069 && post.slug === 'exchange-api-key-read-trade-withdraw-permissions', 'Wrong correction target');
    assert(['draft','publish','pending','private','future'].includes(post.status), 'Unexpected post status');
    assert(Array.isArray(post.doc_category), 'Missing categories');
    assert(post.doc_category.length === 1 && [194,335].includes(post.doc_category[0]), 'Categories changed externally; inspect manually');
  };
  const before = await request(readURL); valid(before);
  const fresh = await request(readURL); valid(fresh);
  assert(isDeepStrictEqual(before, fresh), 'Post changed during lookup; refuse mutation');
  const reused = fresh.doc_category[0] === 335;
  if (!reused) await request(url, {method:'POST',body:JSON.stringify({doc_category:[335]})});
  const after = await request(readURL); valid(after);
  assert(isDeepStrictEqual(after.doc_category,[335]), 'Category readback failed');
  for (const key of ['id','slug','status','title','content','excerpt','doc_tag','author','featured_media','date','date_gmt']) {
    assert(isDeepStrictEqual(fresh[key],after[key]), 'Non-category field changed; inspect manually');
  }
  return {ok:true,verified:true,id:after.id,slug:after.slug,status:after.status,categoryIds:after.doc_category,reused};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const username = process.env.WP_USERNAME_VALUE, password = process.env.WP_PASSWORD_VALUE;
    assert(username && password && !username.includes(':'), 'Missing credentials');
    const headers = {Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64'),'Content-Type':'application/json'};
    const request = async (url,options={}) => {
      assert(new URL(url).origin === 'https://blockweeks.com', 'Unexpected host');
      const response = await fetch(url,{...options,headers,redirect:'error',signal:AbortSignal.timeout(30000)});
      assert(response.ok, 'WordPress HTTP '+response.status);
      return response.json();
    };
    console.log(JSON.stringify(await correctDocsCategory(readJson('sites/blockweeks-docs.json'),request)));
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
