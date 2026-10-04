// Read-only: use from an authorized environment after configuring credentials.
import { writeFileSync } from 'node:fs';
import { assert, loadSite } from './common.mjs';

try {
  const username = process.env.WP_BLOCKWEEKS_USERNAME, password = process.env.WP_BLOCKWEEKS_APP_PASSWORD;
  assert(username && password && !username.includes(':'), 'Configure the two WordPress credential environment variables');
  const report = {checkedAt: new Date().toISOString(), readOnly: true, channels: {}, errors: []};
  const request = async url => {
    let r;
    try { r = await fetch(url, {headers:{Authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`},redirect:'error',signal:AbortSignal.timeout(30000)}); }
    catch { throw new Error('Connection failed or redirected'); }
    let body;
    try {body = await r.json();} catch {throw new Error(`Non-JSON response: HTTP ${r.status}`);}
    assert(r.ok, `HTTP ${r.status}; code=${String(body.code ?? 'unknown').replace(/[^a-z0-9_-]/gi,'')}`);
    return body;
  };
  for (const channel of ['articles','docs','forum','events']) {
    const site = loadSite(`blockweeks-${channel}`);
    try {
      const rows = [], cap = channel === 'articles' ? 200 : 1000;
      let complete = false;
      for (let page = 1; rows.length < cap; page++) {
        const url = new URL(site.collection,site.restBase);
        for (const [k,v] of Object.entries({context:'view',status:'publish',per_page:'100',page:String(page),orderby:'date',order:'desc',_fields:'id,title,slug,link,date,status'})) url.searchParams.set(k,v);
        const batch = await request(url);
        assert(Array.isArray(batch), 'Unexpected inventory response');
        rows.push(...batch);
        if (batch.length < 100) {complete = true;break;}
      }
      report.channels[channel] = {collection:site.collection, published:rows, complete, limit:cap, note:'Read access only; create permissions not tested. Exactly-limit inventories are conservatively marked incomplete.'};
    } catch(e) {report.errors.push({channel,error:e.message});}
  }
  writeFileSync('blockweeks-preflight-result.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({file:'blockweeks-preflight-result.json',channels:Object.keys(report.channels),errors:report.errors}));
  if (report.errors.length) process.exitCode = 1;
} catch(e) {console.error(e.message);process.exitCode=1;}
