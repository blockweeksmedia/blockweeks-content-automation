const assert = (ok,message) => {if(!ok) throw new Error(message);};
const ids = value => Array.isArray(value) && value.every(x => Number.isInteger(x) && x > 0);
const https = value => {const u=new URL(value);assert(u.protocol==='https:' && !u.username && !u.password,'HTTPS URL without credentials required');return u;};

export function validateChannelConfig(site) {
  assert(['wp','tec'].includes(site.adapter),'Invalid adapter');
  assert(/^[a-z0-9_]+$/.test(site.collection??''),'Invalid collection');
  assert(/^[a-z0-9_]+$/.test(site.categoryField??''),'Invalid category field');
  assert(site.tagField===null || /^[a-z0-9_]+$/.test(site.tagField??''),'Invalid tag field');
  assert(ids(site.allowedCategories) && site.allowedCategories.length>0 && ids(site.allowedTags),'Invalid category/tag allowlists');
  assert(site.categories.every(x=>site.allowedCategories.includes(x)) && site.tags.every(x=>site.allowedTags.includes(x)),'Default terms outside allowlists');
  assert(site.authorId===undefined || (Number.isInteger(site.authorId)&&site.authorId>0),'Invalid configured author');
  if(site.importGroup!==undefined) assert(/^[a-z0-9-]+$/.test(site.importGroup),'Invalid import group');
  if(site.adapter==='tec') {
    const u=https(site.eventRestBase);
    assert(u.origin===new URL(site.url).origin && !u.search && !u.hash && u.pathname.endsWith('/') && site.collection==='tribe_events','Invalid TEC route');
  }
}

export function validateChannelArticle(a,site) {
  assert(ids(a.categoryIds) && a.categoryIds.length>0 && a.categoryIds.every(x=>site.allowedCategories.includes(x)),'Choose allowed category IDs');
  assert(new Set(a.categoryIds).size===a.categoryIds.length,'Duplicate category IDs');
  assert(a.tagIds===undefined || (ids(a.tagIds) && a.tagIds.every(x=>site.allowedTags.includes(x))),'Unknown tag IDs');
  assert(site.tagField!==null || !a.tagIds?.length,'Channel does not support tags');
  assert(a.featuredMediaId===undefined || (Number.isInteger(a.featuredMediaId)&&a.featuredMediaId>0&&site.supportsFeaturedMedia!==false),'Channel does not support featured media or ID invalid');
  assert(Array.isArray(a.sources)&&a.sources.length>0&&a.sources.length<=20,'Sources required');
  for(const s of a.sources) {
    assert(s&&typeof s.title==='string'&&s.title.trim()&&typeof s.url==='string','Source title and URL required');
    https(s.url);
    assert(['official','x','reddit','other'].includes(s.kind),'Invalid source kind');
    assert(typeof s.checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(s.checkedAt)&&Number.isFinite(Date.parse(s.checkedAt)),'Source check timestamp required');
    assert(Object.keys(s).every(k=>['title','url','kind','checkedAt','publishedAt','metrics'].includes(k)),'Unknown source field');
    if(s.metrics!==undefined) assert(s.metrics&&typeof s.metrics==='object'&&!Array.isArray(s.metrics)&&Object.keys(s.metrics).every(k=>['likes','comments','reposts','score'].includes(k))&&Object.entries(s.metrics).every(([k,v])=>Number.isFinite(v)&&(k==='score'||v>=0)),'Invalid observed metrics');
  }
  if(site.adapter!=='tec') {assert(a.event===undefined,'Event data only allowed in activities');return;}
  const e=a.event;
  assert(e&&typeof e==='object'&&!Array.isArray(e),'Event fields required');
  assert(Object.keys(e).every(k=>['startDate','endDate','timezone','allDay','website','cost','venueId','organizerIds'].includes(k)),'Unknown event field');
  for(const key of ['startDate','endDate']) {
    assert(typeof e[key]==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e[key]),`Invalid ${key}`);
    const iso=e[key].replace(' ','T')+'Z';
    assert(Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,19)===iso.slice(0,19),`Invalid calendar ${key}`);
  }
  assert(e.endDate>e.startDate,'Event end must follow start');
  assert(typeof e.timezone==='string'&&e.timezone.trim(),'Event timezone required');
  new Intl.DateTimeFormat('en',{timeZone:e.timezone});
  assert(typeof e.allDay==='boolean','Event allDay flag required');
  const website=https(e.website);
  assert(a.sources.some(s=>s.kind==='official'&&new URL(s.url).origin===website.origin),'Official activity source required');
  assert(e.cost===undefined || (typeof e.cost==='string'&&e.cost.length<=200),'Invalid cost');
  assert(e.venueId===undefined || (Number.isInteger(e.venueId)&&e.venueId>0),'Invalid venue');
  assert(e.organizerIds===undefined || ids(e.organizerIds),'Invalid organizer IDs');
}
