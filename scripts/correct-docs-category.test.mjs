import test from 'node:test';
import assert from 'node:assert/strict';
import { correctDocsCategory } from './correct-docs-category.mjs';
const site={siteId:'blockweeks-docs',collection:'docs',categoryField:'doc_category',restBase:'https://blockweeks.com/wp-json/wp/v2/'};
const original={id:329069,slug:'exchange-api-key-read-trade-withdraw-permissions',status:'publish',doc_category:[194],title:{raw:'title'},content:{raw:'edited body'},excerpt:{raw:'excerpt'},doc_tag:[]};
test('changes only category and preserves a published edited article',async()=>{
 let post=structuredClone(original),writes=0;
 const result=await correctDocsCategory(site,async(url,options={})=>{
  if(options.method==='POST'){assert.deepEqual(JSON.parse(options.body),{doc_category:[335]});post.doc_category=[335];writes++;}
  return structuredClone(post);
 });
 assert.equal(writes,1);assert.equal(result.status,'publish');assert.equal(post.content.raw,'edited body');assert.equal(result.verified,true);
});
test('already corrected is idempotent',async()=>{
 let writes=0;
 await correctDocsCategory(site,async(url,options={})=>{if(options.method==='POST')writes++;return {...original,doc_category:[335]};});
 assert.equal(writes,0);
});
test('wrong target or external categories cannot be overwritten',async()=>{
 for(const patch of [{id:1},{doc_category:[194,216]}]){
  let writes=0;
  await assert.rejects(correctDocsCategory(site,async(url,options={})=>{if(options.method==='POST')writes++;return {...original,...patch};}));
  assert.equal(writes,0);
 }
});
test('concurrent content change prevents mutation',async()=>{
 let reads=0,writes=0;
 await assert.rejects(correctDocsCategory(site,async(url,options={})=>{
  if(options.method==='POST')writes++;
  return {...original,content:{raw:++reads===1?'old':'new'}};
 }));
 assert.equal(writes,0);
});
