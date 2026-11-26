// خادم مداد (وضع Pages المتقدم) — ملف واحد بدون استيراد
const BLOCK = ['welib', 'annas-archive', 'annas-', 'libgen', 'library.lol', 'z-lib', 'zlib', '1lib', 'pdfdrive', 'sci-hub', 'b-ok', 'singlelogin'];
const MAX = 30 * 1024 * 1024;
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-final-url' };
let RAW = false;
const err = (msg, status) => RAW ? new Response(`ERR ${status} ${msg}`, { status: 200, headers: { ...CORS, 'content-type': 'text/plain' } }) : new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });

async function onRequestGet({ request }) {
  RAW = new URL(request.url).searchParams.get('raw') === '1';
  const sp = new URL(request.url).searchParams;
  let raw = sp.get('url');
  if (!raw && sp.get('u64')) { try { raw = decodeURIComponent(escape(atob((v => v + '==='.slice((v.length + 3) % 4))(sp.get('u64').replace(/-/g, '+').replace(/_/g, '/'))))); } catch { raw = null; } }
  if (!raw) return err('missing url', 400);
  let target;
  try { target = new URL(raw); } catch { return err('bad url', 400); }
  if (!/^https?:$/.test(target.protocol)) return err('only http(s)', 400);
  const low = target.href.toLowerCase();
  if (BLOCK.some(b => low.includes(b))) return err('blocked source', 403);

  let r;
  try {
    r = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'user-agent': 'MidadReader/1.0 (+https://midad-51j.pages.dev)',
        'accept': 'application/opds+json, application/atom+xml, application/json, application/xml, text/xml, text/html, text/plain;q=0.9, */*;q=0.3'
      },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
  } catch (e) { return err('fetch failed: ' + (e && e.message), 502); }

  if (BLOCK.some(b => r.url.toLowerCase().includes(b))) return err('blocked source', 403);
  const ct = r.headers.get('content-type') || 'application/octet-stream';
  // ملفات الكتب (PDF / EPUB): تمرير مباشر بدون تخزين بالذاكرة
  if (!RAW && /pdf|epub|octet-stream|^image\//i.test(ct)) {
    if (!r.ok) return err('upstream ' + r.status, 502);
    if (+(r.headers.get('content-length') || 0) > 60 * 1024 * 1024) return err('too large', 413);
    return new Response(r.body, { status: 200, headers: { ...CORS, 'content-type': ct, 'cache-control': 'public, max-age=86400', 'x-final-url': r.url } });
  }
  if (!RAW && !/xml|json|html|text|atom|opds/i.test(ct)) return err('unsupported content type: ' + ct, 415);
  if (+(r.headers.get('content-length') || 0) > MAX) return err('too large', 413);
  const body = await r.arrayBuffer();
  if (body.byteLength > MAX) return err('too large', 413);

  if (new URL(request.url).searchParams.get('raw') === '1') {
    const head = `HTTP ${r.status}\nfinal-url: ${r.url}\ncontent-type: ${ct}\n\n`;
    const txt = new TextDecoder().decode(body);
    return new Response(head + `bytes: ${body.byteLength}\n\n` + txt.slice(0, 20000), { status: 200, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return new Response(body, {
    status: r.status,
    headers: { ...CORS, 'content-type': new URL(request.url).searchParams.get('raw') === '1' ? 'text/plain; charset=utf-8' : ct, 'cache-control': 'public, max-age=3600', 'x-final-url': r.url }
  });
}

const onRequestOptions = () => new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'GET, OPTIONS' } });

// المكتبة الرقمية العراقية (العتبة الحسينية): جلب بيانات عدة كتب بطلب واحد
async function libiq(request) {
  const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => n > 0).slice(0, 40);
  if (!ids.length) return err('missing ids', 400);
  const one = async id => {
    try {
      const r = await fetch(`https://api.lib.iq/api/book/getBookMetaData?bookId=${id}`, { headers: { accept: 'application/json', 'user-agent': 'MidadReader/1.0' }, cf: { cacheTtl: 604800, cacheEverything: true } });
      if (!r.ok) return null;
      const j = await r.json();
      const d = j && j.data;
      if (!j.success || !d || d.IsPublic === false || d.IsActive === false) return null;
      const subj = Array.isArray(d.Subjects) ? d.Subjects.map(x => x && (x.SubjectName || x.name || x.Title || x)).filter(x => typeof x === 'string').join('، ') : '';
      return { id, t: d.BookTitle || '', st: d.BookSubtitle || '', a: d.Author || '', lang: d.Language || '', subj: subj || (typeof d.Subject === 'string' ? d.Subject : ''), year: d.PublishYear || '', pub: d.Publisher || '', pages: d.TotalPages || d.page_count || 0, cover: d.imageUrl || '', desc: (d.Description || '').toString().replace(/<[^>]+>/g, ' ').slice(0, 300), rights: d.Rights || '' };
    } catch (e) { return null; }
  };
  const out = await Promise.all(ids.map(one));
  return new Response(JSON.stringify({ ok: true, books: out.filter(Boolean), missing: ids.filter((id, i) => !out[i]) }), { headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.replace(/\/$/, '') === '/api/fetch') {
      if (request.method === 'OPTIONS') return onRequestOptions();
      if (request.method === 'GET') return onRequestGet({ request });
      return new Response('method not allowed', { status: 405 });
    }
    if (url.pathname.replace(/\/$/, '') === '/api/libiq') return libiq(request);
    if (url.pathname === '/api/health') return new Response(JSON.stringify({ ok: true, server: 'midad' }), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    return env.ASSETS.fetch(request);
  }
};
