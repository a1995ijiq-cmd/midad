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
    const head = `HTTP ${r.status}\nfinal-url: ${r.url}\ncontent-type: ${ct}\nx-frame-options: ${r.headers.get('x-frame-options') || '-'}\ncsp: ${(r.headers.get('content-security-policy') || '-').slice(0, 300)}\n\n`;
    const txt = new TextDecoder().decode(body);
    const g = new URL(request.url).searchParams.get('grep');
    if (g) { let out = '', m, re; try { re = new RegExp(g, 'gi'); } catch { re = /$^/g; } let n = 0; while ((m = re.exec(txt)) && n < 80) { out += '…' + txt.slice(Math.max(0, m.index - 150), m.index + 250).replace(/\s+/g, ' ') + '…\n\n'; n++; if (m.index === re.lastIndex) re.lastIndex++; } return new Response(head + `bytes: ${body.byteLength}\nmatches: ${n}\n\n` + out, { status: 200, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }); }
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

// مجموعات عربية على الإنترنت ACO (جامعة نيويورك وشركاؤها): ~18 ألف كتاب عربي ملكية عامة
async function aco(request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get('q') || '').slice(0, 120), page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const H = { 'user-agent': 'Mozilla/5.0 MidadReader/1.0', accept: 'text/html' };
  const dec = t => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
  try {
    const r = await fetch(`https://aco.dlib.nyu.edu/search?q=${encodeURIComponent(q || 'كتاب')}&rpp=24&page=${page}`, { headers: H, cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!r.ok) return err('aco ' + r.status, 502);
    const html = await r.text();
    const total = +((html.match(/class="numfound">(\d+)/) || [])[1] || 0);
    const items = html.split('class="item flexrow"').slice(1).map(c => {
      const id = (c.match(/\/book\/([a-z0-9_]+)\/1/i) || [])[1];
      if (!id) return null;
      const tl = dec((c.match(/class="md_title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
      const au = dec((c.match(/class="md_author"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '').replace(/,?\s*(author|editor|translator)\.?$/i, '').replace(/,\s*\d{3,4}-?\d{0,4}\.?$/, '');
      const yr = ((c.match(/Date of Publication[\s\S]{0,200}?(\d{4})/i) || c.match(/md_date[^>]*>[^<]*?(\d{4})/) || [])[1]) || '';
      return { id, tl, a: au, year: yr };
    }).filter(Boolean);
    // العنوان العربي من صفحة كل كتاب (og:title)
    await Promise.all(items.map(async it => {
      try {
        const b = await fetch(`https://aco.dlib.nyu.edu/book/${it.id}/1?lang=ar`, { headers: H, cf: { cacheTtl: 2592000, cacheEverything: true } });
        if (!b.ok) return;
        const t = await b.text();
        const og = (t.match(/property="og:title"\s+content="([^"]+)"/) || t.match(/<title>([^<]+)<\/title>/) || [])[1];
        if (og && /[؀-ۿ]/.test(og)) it.t = dec(og).replace(/[\s:\/;,،]+$/, '');
      } catch (e) {}
    }));
    const books = items.map(it => ({ id: it.id, t: it.t || it.tl, tl: it.tl, a: it.a, year: it.year }));
    return new Response(JSON.stringify({ ok: true, total, page, books }), { headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  } catch (e) { return err('aco failed', 502); }
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
    if (url.pathname.replace(/\/$/, '') === '/api/aco') return aco(request);
    if (url.pathname.replace(/\/$/, '') === '/api/acon') {
      const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9_]/gi, '');
      if (!id) return err('missing id', 400);
      try {
        const r = await fetch(`https://sites.dlib.nyu.edu/viewer/books/${id}/1?embed=1`, { headers: { 'user-agent': 'Mozilla/5.0 MidadReader/1.0' }, cf: { cacheTtl: 2592000, cacheEverything: true } });
        const t = await r.text(); const n = +((t.match(/data-sequence-count="(\d+)"/) || t.match(/class="sequence_count">(\d+)/) || [])[1] || 0);
        return new Response(JSON.stringify({ ok: !!n, id, n }), { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=2592000' } });
      } catch (e) { return err('acon failed', 502); }
    }
    if (url.pathname.startsWith('/api/r/')) { const u = new URL(request.url); u.pathname = '/api/fetch'; u.search = '?raw=1&u64=' + url.pathname.slice(7) + (url.searchParams.get('grep') ? '&grep=' + encodeURIComponent(url.searchParams.get('grep')) : ''); return onRequestGet({ request: new Request(u.toString()) }); }
    if (url.pathname === '/api/health') return new Response(JSON.stringify({ ok: true, server: 'midad' }), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    return env.ASSETS.fetch(request);
  }
};
