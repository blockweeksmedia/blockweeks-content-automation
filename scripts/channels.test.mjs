import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateArticle, validateSite } from './common.mjs';
import { importArticle } from './import-wordpress.mjs';
import { payloadFor, verifyTECEvent } from './channel-adapters.mjs';

const config = channel => ({...JSON.parse(readFileSync(new URL(`../sites/blockweeks-${channel}.json`,import.meta.url))),enabled:true,minimumCharacters:4});
const article = (channel,extra={}) => ({siteId:`blockweeks-${channel}`,date:'2026-10-04',topicId:'topic-1',title:'真实问题测试',slug:'discussion-test',excerpt:'测试摘要',content:'<p>用于核对路由与栏目的一段内容。</p>',source:'codex-scheduled-task',categoryIds:[config(channel).allowedCategories[0]],sources:[{title:'原始来源',url:'https://example.org/announcement',kind:'official',checkedAt:'2026-10-04T10:00:00Z'}],...extra});
const env={WP_BLOCKWEEKS_USERNAME:'test-user',WP_BLOCKWEEKS_APP_PASSWORD:'not-a-real-password'};
const response = x => ({ok:true,status:200,json:async()=>x});
const pathFor = a => `automation/blog-inbox/${a.siteId}/${a.date}-${a.slug}.json`;
const stored = (a,s) => ({id:42,slug:a.slug,status:s.status,title:{raw:a.title},content:{raw:a.content},...(s.supportsExcerpt===false?{}:{excerpt:{raw:a.excerpt}}),[s.categoryField]:a.categoryIds,...(s.tagField?{[s.tagField]:a.tagIds??s.tags}:{}),link:'https://blockweeks.com/test'});

test('four configurations validate for checked draft imports',()=>{
 for(const name of ['articles','docs','forum','events']){const s=JSON.parse(readFileSync(new URL(`../sites/blockweeks-${name}.json`,import.meta.url)));validateSite(s);assert.equal(s.enabled,true);assert.equal(s.status,'draft');assert.equal(s.mergeMode,'checked');}
});

for(const channel of ['articles','docs','forum']){
 test(`${channel}: correct route and taxonomy fields, with readback`,async()=>{
  const s=config(channel),a=article(channel),p=stored(a,s),calls=[];
  const r=await importArticle(a,s,{env,fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return response(calls.length===1?[]:p);}});
  assert.equal(new URL(calls[1].url).pathname,`/wp-json/wp/v2/${s.collection}`);
  const payload=JSON.parse(calls[1].options.body);
  assert.deepEqual(payload[s.categoryField],a.categoryIds);
  if(channel==='forum'){assert.equal('excerpt' in payload,false);assert.equal('tags' in payload,false);assert.equal('categories' in payload,false);}
  assert.equal(calls.length,3);assert.equal(r.verified,true);
 });
}

test('wrong channel category and unsupported fields fail before any request',async()=>{
 const s=config('docs'),a=article('docs',{categoryIds:[1816]});let calls=0;
 await assert.rejects(importArticle(a,s,{env,fetchImpl:async()=>{calls++;return response([]);}}),/category/);assert.equal(calls,0);
 const f=config('forum'),b=article('forum',{featuredMediaId:3});assert.throws(()=>validateArticle(b,f,pathFor(b)),/featured media/);
 const fakeAuthor=article('docs',{authorId:123});assert.throws(()=>validateArticle(fakeAuthor,s,pathFor(fakeAuthor)),/Unknown/);
});

test('existing mismatched categories or published-state collisions cannot be reused',async()=>{
 const s=config('docs'),a=article('docs');
 for(const override of [{doc_category:[1816]},{status:'publish'}]){
  let writes=0;await assert.rejects(importArticle(a,s,{env,fetchImpl:async(_,o)=>{if(o.method==='POST')writes++;return response([{...stored(a,s),...override}]);}}));assert.equal(writes,0);
 }
});

const event = {startDate:'2026-11-03 09:00:00',endDate:'2026-11-03 18:00:00',timezone:'Asia/Tokyo',allDay:false,website:'https://example.org/announcement',venueId:14,organizerIds:[11]};
test('activity uses native create endpoint and reads both core and native data back',async()=>{
 const s=config('events'),a=article('events',{event}),p=stored(a,s),calls=[];
 const native={id:42,start_date:event.startDate,end_date:event.endDate,timezone:event.timezone,all_day:false,website:event.website,venue:{id:14},organizer:[{id:11}]};
 const r=await importArticle(a,s,{env,fetchImpl:async(u,o)=>{calls.push({url:String(u),options:o});return response(calls.length===1?[]:calls.length===4?native:p);}});
 assert.equal(new URL(calls[1].url).pathname,'/wp-json/tribe/events/v1/events');
 const body=JSON.parse(calls[1].options.body);assert.equal(body.start_date,event.startDate);assert.equal(body.description,a.content);assert.deepEqual(body.categories,a.categoryIds);assert.equal('content' in body,false);
 assert.equal(calls.length,4);assert.equal(r.verified,true);
});

test('activity impossible dates, missing timezone and unverified source rejected',()=>{
 const s=config('events');
 for(const e of [{...event,startDate:'2026-02-30 09:00:00'},{...event,endDate:event.startDate},{...event,timezone:undefined},{...event,website:'https://unverified.example.org/'}]){
  const a=article('events',{event:e});assert.throws(()=>validateArticle(a,s,pathFor(a)));
 }
});

test('activity retry reuses identical item; lost create response never auto-retries',async()=>{
 const s=config('events'),a=article('events',{event}),p=stored(a,s);let count=0;
 const native={start_date:event.startDate,end_date:event.endDate,timezone:event.timezone,all_day:false,website:event.website,venue:{id:14},organizer:[{id:11}]};
 const r=await importArticle(a,s,{env,fetchImpl:async()=>response(++count===1?[p]:native)});assert.equal(r.reused,true);assert.equal(count,2);
 let writes=0;await assert.rejects(importArticle(a,s,{env,fetchImpl:async(_,o)=>{if(o.method==='POST'){writes++;throw Error('lost response');}return response([]);}}));assert.equal(writes,1);
});

test('event metadata cannot be submitted to an ordinary article route',()=>{
 const s=config('articles'),a=article('articles',{event});assert.throws(()=>validateArticle(a,s,pathFor(a)));
 assert.equal(payloadFor(article('forum'),config('forum')).qa_cat[0],1817);
});

test('free event creation preserves zero and verifies numeric cost, not empty metadata',()=>{
 const a=article('events',{event:{...event,cost:'0'}});
 assert.equal(payloadFor(a,config('events')).cost,'0.00');
 const native={start_date:event.startDate,end_date:event.endDate,timezone:event.timezone,all_day:false,website:event.website,venue:{id:14},organizer:[{id:11}],cost:'免费',cost_details:{values:['0.00']}};
 assert.doesNotThrow(()=>verifyTECEvent(native,a));
 assert.throws(()=>verifyTECEvent({...native,cost:'',cost_details:{values:[]}},a),/cost/);
 assert.throws(()=>verifyTECEvent({...native,cost_details:{values:['10']}},a),/cost/);
});
test('paid event verification accepts formatting but rejects different or multiple amounts',()=>{
 const a=article('events',{event:{...event,cost:'99.50'}});
 const native={start_date:event.startDate,end_date:event.endDate,timezone:event.timezone,all_day:false,website:event.website,venue:{id:14},organizer:[{id:11}],cost:'$99.50',cost_details:{values:[99.5]}};
 assert.doesNotThrow(()=>verifyTECEvent(native,a));
 assert.throws(()=>verifyTECEvent({...native,cost_details:{values:[100]}},a),/cost/);
 assert.throws(()=>verifyTECEvent({...native,cost_details:{values:[99.5,199]}},a),/cost/);
});
