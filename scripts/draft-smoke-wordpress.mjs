// Explicit integration fixtures: four labelled drafts, never published.
import {writeFileSync} from 'node:fs';
import {loadSite,assert} from './common.mjs';
import {importArticle} from './import-wordpress.mjs';
import {payloadFor,verifyWPPost} from './channel-adapters.mjs';
const report={checkedAt:new Date().toISOString(),draftOnly:true,results:[]};
const username=process.env.WP_BLOCKWEEKS_USERNAME,password=process.env.WP_BLOCKWEEKS_APP_PASSWORD;
assert(username&&password&&!username.includes(':'),'Missing WordPress credentials');
const headers={Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64')};
const r=await fetch('https://blockweeks.com/wp-json/wp/v2/users/me?context=edit&_fields=capabilities',{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
assert(r.ok,'Unable to verify account permissions');
const me=await r.json();
assert(me.capabilities?.publish_posts&&me.capabilities?.publish_tribe_events&&me.capabilities?.edit_others_posts,'Account permissions are not ready');
for(const [key,label,category] of [['articles','文章',207],['docs','知识库',256],['forum','论坛问答',1816],['events','活动',200]]){
 const site=loadSite('blockweeks-'+key);
 assert(site.status==='draft','Smoke test requires draft configuration');
 // Short fixtures use the production import function without altering site limits.
 const testSite={...site,enabled:true,status:'draft',minimumCharacters:1};
 const slug='blockweeks-automation-smoke-'+key+'-20261005';
 const article={siteId:site.siteId,date:'2026-10-05',topicId:'smoke-'+key+'-20261005',
 title:'【自动化测试草稿】'+label+'接口验证，请勿发布',slug,
 excerpt:'仅用于验证自动化接口、分类与草稿状态，不是正式内容。',
 content:'<p>这是 BlockWeeks 自动化发布工具的接口测试草稿，不是正式内容，请勿公开发布。</p><p>本次验证标题、正文、分类和草稿状态能否正确保存，以及保存后能否通过接口读取并核对。验证完成后可由管理员删除本草稿。</p>',
 source:'codex-scheduled-task',categoryIds:[category],tagIds:[],
 sources:[{title:'BlockWeeks 自动化接口测试说明',url:'https://blockweeks.com',kind:'official',checkedAt:new Date().toISOString()}]};
 if(key==='events')article.event={startDate:'2030-01-01 10:00:00',endDate:'2030-01-01 11:00:00',timezone:'Asia/Shanghai',allDay:false,website:'https://blockweeks.com',cost:'0'};
 try{
   // Repair only the known smoke fixture that the plugin saved with an empty cost.
   if(key==='events'){
     const u=new URL(site.collection,site.restBase);
     for(const [k,v] of Object.entries({slug,context:'edit',status:'any',per_page:'100'}))u.searchParams.set(k,v);
     const lookup=await fetch(u,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
     assert(lookup.ok,'Smoke event repair lookup failed');
     const rows=await lookup.json();
     assert(Array.isArray(rows),'Unexpected smoke lookup');
     const matches=rows.filter(x=>x.slug===slug);
     assert(matches.length<=1,'Multiple smoke events');
     if(matches.length){
       verifyWPPost(matches[0],article,testSite);
       const url=new URL('events/'+matches[0].id,site.eventRestBase);
       const read=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
       assert(read.ok,'Smoke native read failed');
       const native=await read.json();
       if(native.cost===''&&Array.isArray(native.cost_details?.values)&&native.cost_details.values.length===0){
         const fixed=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payloadFor(article,testSite)),redirect:'error',signal:AbortSignal.timeout(30000)});
         assert(fixed.ok,'Smoke zero-cost repair failed; inspect before retry');
       }
     }
   }
   report.results.push(await importArticle(article,testSite));
 }
 catch(e){
   const result={channel:site.siteId,ok:false,error:e.message};
   // Inspect possible partial creation using GET only. Do not retry a write.
   try{
     const u=new URL(site.collection,site.restBase);
     for(const [k,v] of Object.entries({slug,context:'edit',status:'any',per_page:'100',_fields:'id,slug,status,link,title,content,excerpt,'+site.categoryField+(site.tagField?','+site.tagField:'')}))u.searchParams.set(k,v);
     const read=await fetch(u,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
     if(read.ok){const rows=await read.json();if(Array.isArray(rows))result.observed=rows.filter(x=>x.slug===slug);}
   }catch{}
   if(key==='events'){
     try{
       const found=result.observed?.[0];
       if(found){const read=await fetch(new URL('events/'+found.id,site.eventRestBase),{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
         if(read.ok){const event=await read.json();result.eventObserved={start_date:event.start_date,end_date:event.end_date,timezone:event.timezone,all_day:event.all_day,website:event.website,cost:event.cost,cost_details:event.cost_details};}
       }
     }catch{}
   }
   report.results.push(result);
 }
 writeFileSync('blockweeks-draft-smoke-result.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));
if(report.results.some(x=>!x.ok))process.exitCode=1;
