import { assert } from './common.mjs';

export function payloadFor(article, site) {
  const common = { title: article.title, slug: article.slug, status: site.status };
  if (site.authorId) common.author = site.authorId;
  if (site.adapter === 'tec') {
    const e = article.event;
    return { ...common, description: article.content, excerpt: article.excerpt,
      start_date: e.startDate, end_date: e.endDate, timezone: e.timezone, all_day: e.allDay,
      website: e.website, categories: article.categoryIds, tags: article.tagIds ?? site.tags,
      ...(e.cost === undefined ? {} : { cost: e.cost }),
      ...(e.venueId ? { venue: e.venueId } : {}),
      ...(e.organizerIds?.length ? { organizer: e.organizerIds } : {}),
      ...(article.featuredMediaId ? { image: String(article.featuredMediaId) } : {}) };
  }
  return { ...common, content: article.content,
    ...(site.supportsExcerpt === false ? {} : { excerpt: article.excerpt }),
    [site.categoryField ?? 'categories']: article.categoryIds ?? site.categories,
    ...(site.tagField === null ? {} : { [site.tagField ?? 'tags']: article.tagIds ?? site.tags }),
    ...(article.featuredMediaId ? { featured_media: article.featuredMediaId } : {}) };
}

const sameIDs = (actual, expected) => Array.isArray(actual) &&
  JSON.stringify([...actual].sort((a,b) => a-b)) === JSON.stringify([...expected].sort((a,b) => a-b));

export function verifyWPPost(post, article, site) {
  assert(Number.isInteger(post.id) && post.slug === article.slug && post.status === site.status, 'Post ID, slug or status mismatch');
  assert(post.title?.raw === article.title && post.content?.raw === article.content, 'Stored title or content mismatch; inspect before retry');
  if (site.supportsExcerpt !== false) assert(post.excerpt?.raw === article.excerpt, 'Stored excerpt mismatch');
  assert(sameIDs(post[site.categoryField], article.categoryIds), 'Stored category mismatch');
  if (site.tagField) assert(sameIDs(post[site.tagField], article.tagIds ?? site.tags), 'Stored tags mismatch');
  if (site.authorId) assert(post.author === site.authorId, 'Stored author mismatch');
  if (article.featuredMediaId && site.adapter !== 'tec') assert(post.featured_media === article.featuredMediaId, 'Stored cover mismatch');
}

export function verifyTECEvent(event, article) {
  const e = article.event;
  assert(event.start_date === e.startDate && event.end_date === e.endDate && event.timezone === e.timezone && event.all_day === e.allDay, 'Stored activity date/time mismatch');
  assert(event.website === e.website, 'Stored activity official URL mismatch');
  if (e.cost !== undefined) assert(String(event.cost) === e.cost, 'Stored event cost mismatch');
  if (e.venueId) assert(event.venue?.id === e.venueId, 'Stored venue mismatch');
  if (e.organizerIds?.length) assert(sameIDs(event.organizer?.map(x => x.id), e.organizerIds), 'Stored organizer mismatch');
  if (article.featuredMediaId) assert(event.image?.id === article.featuredMediaId, 'Stored event cover mismatch');
}

export async function importChannel(article, site, request) {
  const collection = new URL(site.collection, site.restBase);
  const query = new URL(collection);
  for (const [key, value] of Object.entries({slug: article.slug, context: 'edit', status: 'any', per_page: '100'})) query.searchParams.set(key,value);
  const rows = await request(query);
  assert(Array.isArray(rows), 'Lookup did not return a post array');
  const matches = rows.filter(p => p.slug === article.slug);
  assert(matches.length <= 1, 'Multiple matching posts; inspect manually');
  let p, reused = false;
  if (matches.length) {
    p = matches[0];
    verifyWPPost(p, article, site);
    reused = true;
  } else {
    const target = site.adapter === 'tec' ? new URL('events', site.eventRestBase) : collection;
    const created = await request(target, {method:'POST', body: JSON.stringify(payloadFor(article,site))});
    assert(Number.isInteger(created.id) && created.slug === article.slug && created.status === site.status, 'Unexpected creation result; inspect before retry');
    const readback = new URL(`${site.collection}/${created.id}`, site.restBase);
    readback.searchParams.set('context','edit');
    p = await request(readback);
    verifyWPPost(p,article,site);
  }
  if (site.adapter === 'tec') {
    const event = await request(new URL(`events/${p.id}`, site.eventRestBase));
    verifyTECEvent(event,article);
  }
  return {ok:true,reused,id:p.id,slug:p.slug,status:p.status,link:p.link,channel:site.siteId,verified:true};
}
