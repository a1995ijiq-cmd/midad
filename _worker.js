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

  if (RAW && new URL(request.url).searchParams.get('head') === '1') {
    try { const h = await fetch(target.href, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 MidadReader/1.0' } });
      return new Response(`HTTP ${h.status}\nfinal-url: ${h.url}\ncontent-type: ${h.headers.get('content-type')}\ncontent-length: ${h.headers.get('content-length')}\naccept-ranges: ${h.headers.get('accept-ranges')}\nacao: ${h.headers.get('access-control-allow-origin')}\n`, { headers: { ...CORS, 'content-type': 'text/plain' } });
    } catch (e) { return err('head failed ' + e.message, 502); } }
  let r;
  try {
    r = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'user-agent': 'MidadReader/1.0 (+https://midad-51j.pages.dev)',
        'accept': 'application/opds+json, application/atom+xml, application/json, application/xml, text/xml, text/html, text/plain;q=0.9, */*;q=0.3',
        ...(request.headers.get('range') ? { range: request.headers.get('range') } : {})
      },
      cf: request.headers.get('range') ? {} : { cacheTtl: 3600, cacheEverything: true }
    });
  } catch (e) { return err('fetch failed: ' + (e && e.message), 502); }

  if (BLOCK.some(b => r.url.toLowerCase().includes(b))) return err('blocked source', 403);
  const ct = r.headers.get('content-type') || 'application/octet-stream';
  // ملفات الكتب (PDF / EPUB): تمرير مباشر بدون تخزين بالذاكرة
  if (!RAW && /pdf|epub|octet-stream|^image\//i.test(ct)) {
    if (!r.ok) return err('upstream ' + r.status, 502);
    if (r.status !== 206 && +(r.headers.get('content-length') || 0) > 60 * 1024 * 1024) return err('too large', 413);
    const h = { ...CORS, 'content-type': ct, 'cache-control': 'public, max-age=86400', 'x-final-url': r.url, 'access-control-expose-headers': 'content-length, content-range, x-final-url' };
    if (r.headers.get('content-length')) h['content-length'] = r.headers.get('content-length');
    if (r.status === 206 && r.headers.get('content-range')) h['content-range'] = r.headers.get('content-range');
    return new Response(r.body, { status: r.status === 206 ? 206 : 200, headers: h });
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

// ===== المساعد الذكي: يعتمد فقط على نص الكتاب المرسَل، والمفتاح محفوظ بالخادم =====
const AI_TASKS = {
  summary: 'لخّص النص التالي بالعربية في فقرة أو فقرتين واضحتين، ثم 3–6 نقاط بأهم ما ورد.',
  ideas: 'استخرج الأفكار الرئيسية من النص التالي كنقاط مرقّمة، مع جملة توضيح لكل فكرة.',
  terms: 'استخرج المصطلحات والكلمات الصعبة أو الغريبة من النص التالي، واشرح كل واحدة بإيجاز بحسب سياقها في النص.',
  quiz: 'أنشئ 5 أسئلة مراجعة اختيار من متعدد (4 خيارات) من النص التالي فقط، واذكر الإجابة الصحيحة وموضعها بعد كل سؤال.',
  ask: 'أجب عن سؤال القارئ اعتماداً على النص التالي فقط.',
  notes: 'حوّل ملاحظات القارئ وتظليلاته التالية إلى ملخص شخصي منظّم بعناوين قصيرة ونقاط.'
};
async function aiHandler(request, env) {
  const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (request.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
  if (request.method === 'GET') return J({ ok: true, provider: env.ANTHROPIC_API_KEY ? 'claude' : env.AI ? 'workers-ai' : null });
  if (request.method !== 'POST') return J({ error: 'method' }, 405);
  let b; try { b = await request.json(); } catch { return J({ error: 'bad json' }, 400); }
  const task = AI_TASKS[b.task] ? b.task : 'ask';
  const ctx = (Array.isArray(b.ctx) ? b.ctx : []).filter(x => x && x.text).slice(0, 40);
  let text = '', used = 0;
  for (const c of ctx) { const t = String(c.text).slice(0, 4000); if (used + t.length > 22000) break; text += `\n[ص ${+c.p || '?'}]\n${t}\n`; used += t.length; }
  if (!text.trim()) return J({ error: 'no_text', message: 'لا يوجد نص قابل للقراءة لهذا الكتاب.' }, 422);
  const q = String(b.q || '').slice(0, 600);
  const book = `«${String(b.title || '').slice(0, 150)}»${b.author ? ' — ' + String(b.author).slice(0, 100) : ''}`;
  const system = `أنت مساعد قراءة داخل تطبيق «مداد». تعمل على كتاب ${book}.
قواعد صارمة:
- اعتمد فقط على النص المرفق بين وسوم <النص>. لا تضف معلومات من خارجه ولا تنسب للكتاب ما لم يرد فيه.
- كل مقطع مسبوق برقم صفحته مثل [ص 12]. عند ذكر معلومة، أحِل إلى صفحتها بالصيغة (ص 12).
- إذا لم يكن الجواب موجوداً في النص فقل بوضوح: «لا يذكر النص المرفق ذلك» ولا تخمّن.
- اكتب بالعربية الفصحى المبسّطة، بإيجاز ووضوح، ونسّق بنقاط عند الحاجة. لا تستخدم Markdown معقداً (عناوين قصيرة ونقاط فقط).`;
  const user = `${AI_TASKS[task]}${task === 'ask' ? `\nسؤال القارئ: ${q}` : ''}\n<النص>${text}</النص>`;
  try {
    if (env.ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 1200, system, messages: [{ role: 'user', content: user }] }) });
      const j = await r.json();
      if (!r.ok) return J({ error: 'provider', message: (j.error && j.error.message) || ('HTTP ' + r.status) }, 502);
      return J({ ok: true, provider: 'claude', answer: (j.content || []).map(x => x.text || '').join('').trim() });
    }
    if (env.AI) {
      const r = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 1200 });
      return J({ ok: true, provider: 'workers-ai', answer: String((r && (r.response || r.result && r.result.response)) || '').trim() });
    }
    return J({ error: 'not_configured', message: 'المساعد الذكي غير مفعّل على الخادم بعد.' }, 503);
  } catch (e) { return J({ error: 'failed', message: String(e && e.message || e) }, 502); }
}

/* تفاسير أهل البيت (ع) حسب الآية: الميزان ونور الثقلين من holyquran.net (عرض للقراءة مع ذكر المصدر) */
const SHT = { almizan: 'almizan', noor: 'noor' };
const decEnt = t => t.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
async function shTafsir(url) {
  const b = SHT[url.searchParams.get('b')], s = +url.searchParams.get('s'), a = +url.searchParams.get('a');
  if (!b || !(s >= 1 && s <= 114) || !(a >= 1 && a <= 286)) return err('bad params', 400);
  const src = `https://holyquran.net/tafseer/view.php?book=${b}&ch=${s}&vr=${a}`;
  try {
    const r = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0 MidadReader/1.0', 'accept-language': 'ar' }, cf: { cacheTtl: 2592000, cacheEverything: true } });
    if (!r.ok) return err('upstream ' + r.status, 502);
    const h = await r.text();
    const hero = (h.match(/<header class="tafseer-hero">([\s\S]*?)<\/header>/) || [])[1] || '';
    const range = decEnt(((hero.match(/التفسير يعرض[^<]*/) || [])[0] || '').trim());
    const i = h.search(/<div class="tafseer-text[^"]*">/);
    if (i < 0) return new Response(JSON.stringify({ ok: false, src }), { headers: { ...CORS, 'content-type': 'application/json' } });
    let body = h.slice(i); { const re = /<(\/?)div\b[^>]*>/gi; let d = 0, m; while ((m = re.exec(body))) { d += m[1] ? -1 : 1; if (d === 0) { body = body.slice(0, m.index); break } } }
    const paras = body.replace(/<br\s*\/?>/gi, '\n').split(/<\/p>|<\/h[1-6]>|<\/div>|<\/article>/i).flatMap(x => decEnt(x.replace(/<[^>]+>/g, '')).split(/\n+/)).map(x => x.replace(/[ \t]+/g, ' ').trim().replace(/^([٠-٩0-9]{1,5})(?=[^\s٠-٩0-9])/, '$1 ـ ')).filter(x => x.length > 0).slice(0, 600);
    return new Response(JSON.stringify({ ok: paras.length > 0, range, paras, src }), { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=604800' } });
  } catch (e) { return err('fetch failed', 502); }
}

/* rafed.net (كتب شيعية رقمية): استخراج الفهرس ونص الصفحة من حمولة Next.js */
function rfDecode(h) {
  let out = ''; const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g; let m;
  while ((m = re.exec(h))) { try { out += JSON.parse('"' + m[1] + '"') } catch (e) { } }
  return out || h;
}
async function rfPage(b, p) {
  const r = await fetch(`https://books.rafed.net/view/${b}/page/${p}`, { headers: { 'user-agent': 'Mozilla/5.0 MidadReader/1.0', 'accept-language': 'ar' }, cf: { cacheTtl: 2592000, cacheEverything: true } });
  if (!r.ok) throw new Error('rafed ' + r.status);
  const d = rfDecode(await r.text());
  const idx = []; { const re = /\{"title":"((?:[^"\\]|\\.)*)","page":(\d+)/g; let m; while ((m = re.exec(d))) { try { idx.push([decEnt(JSON.parse('"' + m[1] + '"')), +m[2]]) } catch (e) { } } }
  let html = ''; { const re = /"(?:content|text|body|html)":"((?:[^"\\]|\\.)*?rfd(?:[^"\\]|\\.)*)"/; const m = d.match(re); if (m) { try { html = JSON.parse('"' + m[1] + '"') } catch (e) { } } }
  if (!html) { const i = d.indexOf('<p class=rfd'); if (i >= 0) html = d.slice(Math.max(0, d.lastIndexOf('"', i) + 1), d.indexOf('"', i + 20)); }
  const paras = html.replace(/<br\s*\/?>/gi, '\n').split(/<\/p>|<\/h[1-6]>|<\/div>/i).flatMap(x => decEnt(x.replace(/<[^>]+>/g, '')).split(/\n+/)).map(x => x.replace(/[ \t\r]+/g, ' ').replace(/^>\s*/, '').trim()).filter(x => x && !/^<|class=|width=|style=|^["']?\s*>/.test(x));
  const title = ((d.match(/"book":\{"id":\d+,"title":"((?:[^"\\]|\\.)*)"/) || [])[1] || '');
  const part = +((d.match(/"part":(\d+)/) || [])[1] || 0);
  const pagesN = +((d.match(/"page_count":(\d+)/) || d.match(/"pages_count":(\d+)/) || [])[1] || 0);
  return { title: decEnt(title), part, pagesN, idx, paras };
}
async function rafedApi(url) {
  const b = +url.searchParams.get('b'), p = +url.searchParams.get('p') || 1;
  if (url.searchParams.get('probe')) { const [f, t] = url.searchParams.get('probe').split('-').map(Number); const out = await Promise.all(Array.from({ length: Math.min(45, t - f + 1) }, (_, k) => f + k).map(async id => { try { const r = await fetch(`https://books.rafed.net/view/${id}/page/1`, { headers: { 'user-agent': 'Mozilla/5.0' } }); const d = rfDecode(await r.text()); return [id, decEnt(((d.match(/"book":\{"id":\d+,"title":"((?:[^"\\]|\\.)*)"/) || [])[1] || '')), +((d.match(/"part":(\d+)/) || [])[1] || 0)] } catch (e) { return [id, 'ERR', 0] } })); return new Response(JSON.stringify(out), { headers: { ...CORS, 'content-type': 'application/json' } }) }
  if (!(b > 0)) return err('bad params', 400);
  try { const x = await rfPage(b, p); return new Response(JSON.stringify({ ok: true, b, p, ...x, idx: url.searchParams.get('full') ? x.idx : x.idx.slice(0, 12), nidx: x.idx.length }), { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }) }
  catch (e) { return err(String(e.message || e), 502) }
}

/* الأمثل (مكارم الشيرازي) من rafed: فهرس الأجزاء العشرين يحدد صفحات تفسير كل آية */
const AMTHAL_VOLS = [2022, 2023, 2030, 2037, 2042, 2043, 2047, 2048, 2049, 2050, 2051, 2056, 2057, 2059, 2060, 2062, 2063, 2065, 2066, 2067];
const SURA_N = 'الفاتحة البقرة آل_عمران النساء المائدة الأنعام الأعراف الأنفال التوبة يونس هود يوسف الرعد إبراهيم الحجر النحل الإسراء الكهف مريم طه الأنبياء الحج المؤمنون النور الفرقان الشعراء النمل القصص العنكبوت الروم لقمان السجدة الأحزاب سبأ فاطر يس الصافات ص الزمر غافر فصلت الشورى الزخرف الدخان الجاثية الأحقاف محمد الفتح الحجرات ق الذاريات الطور النجم القمر الرحمن الواقعة الحديد المجادلة الحشر الممتحنة الصف الجمعة المنافقون التغابن الطلاق التحريم الملك القلم الحاقة المعارج نوح الجن المزمل المدثر القيامة الإنسان المرسلات النبأ النازعات عبس التكوير الانفطار المطففين الانشقاق البروج الطارق الأعلى الغاشية الفجر البلد الشمس الليل الضحى الشرح التين العلق القدر البينة الزلزلة العاديات القارعة التكاثر العصر الهمزة الفيل قريش الماعون الكوثر الكافرون النصر المسد الإخلاص الفلق الناس'.split(' ').map(x => x.replace('_', ' '));
const SURA_ALIAS = { 'الحمد': 1, 'بني اسرائيل': 17, 'المؤمن': 40, 'حم السجدة': 41, 'الدهر': 76, 'هل اتى': 76, 'عم': 78, 'التطفيف': 83, 'الم نشرح': 94, 'الانشراح': 94, 'اقرا': 96, 'لم يكن': 98, 'الزلزال': 99, 'تبت': 111, 'اللهب': 111, 'التوحيد': 112, 'القتال': 47, 'الملائكة': 35, 'التطفيف': 83 };
const arNorm = t => t.replace(/[ً-ْٰـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ی/g, 'ي').replace(/\s+/g, ' ').trim();
const SURA_MAP = (() => { const m = {}; SURA_N.forEach((n, i) => { m[arNorm(n)] = i + 1; m[arNorm(n).replace(/^ال/, '')] = i + 1 }); for (const k in SURA_ALIAS) m[arNorm(k)] = SURA_ALIAS[k]; return m })();
const toEn = t => +String(t).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
async function amthalIndex() {
  const ck = new Request('https://midad.cache/amthal-index-v2'); const c = caches.default;
  const hit = await c.match(ck); if (hit) return hit.json();
  const vols = await Promise.all(AMTHAL_VOLS.map(b => rfPage(b, 1).then(x => x.idx).catch(() => [])));
  const ent = []; let sura = 0;
  vols.forEach((idx, vi) => {
    const seen = new Set();
    for (const [t0, pg] of idx) {
      const key = t0 + '|' + pg; if (seen.has(key)) continue; seen.add(key);
      const t = arNorm(t0);
      const sm = t.match(/^سوره\s+(.+?)(\s*\(.*\))?$/);
      if (sm) { const n = SURA_MAP[sm[1].trim()] || SURA_MAP[sm[1].trim().replace(/^ال/, '')]; if (n && n >= sura) { if (n !== sura) ent.push({ v: vi, p: pg, s: n, h: 1 }); sura = n } continue }
      const am = t.match(/تفسير\s*ال?اي?[يی]*(?:ه|ات|تين|تان|ت?ين)?\s*:?\s*([0-9٠-٩۰-۹]+)(?:\s*[\-–—]?\s*([0-9٠-٩۰-۹]+))?/);
      if (am && sura) { const a1 = toEn(am[1]), a2 = am[2] ? toEn(am[2]) : a1; ent.push({ v: vi, p: pg, s: sura, a1, a2 }) }
    }
  });
  const res = new Response(JSON.stringify(ent), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=2592000' } });
  await c.put(ck, res.clone()); return ent;
}
async function amthalApi(url) {
  const s = +url.searchParams.get('s'), a = +url.searchParams.get('a');
  if (!(s >= 1 && s <= 114) || !(a >= 1 && a <= 286)) return err('bad params', 400);
  try {
    const ent = await amthalIndex();
    if (url.searchParams.get('dbg')) return new Response(JSON.stringify({ n: ent.length, s: ent.filter(e => e.s === s) }), { headers: { ...CORS, 'content-type': 'application/json' } });
    const list = ent.filter(e => e.s === s && !e.h);
    let i = list.findIndex(e => a >= e.a1 && a <= e.a2);
    if (i < 0) { const prev = list.filter(e => e.a1 <= a); if (prev.length) i = list.indexOf(prev[prev.length - 1]) }
    if (i < 0) return new Response(JSON.stringify({ ok: false }), { headers: { ...CORS, 'content-type': 'application/json' } });
    const e = list[i]; const gi = ent.indexOf(e); const nx = ent[gi + 1];
    const b = AMTHAL_VOLS[e.v]; const endP = nx && nx.v === e.v ? nx.p : e.p + 6;
    const pages = []; for (let p = e.p; p <= Math.min(endP, e.p + 14); p++) pages.push(p);
    const got = await Promise.all(pages.map(p => rfPage(b, p).then(x => x.paras).catch(() => [])));
    let paras = got.flat().filter(x => x !== '>' && !/^[٠-٩0-9]+$/.test(x));
    const H = /^(الآية|الآيتان|الآيات|الآیة|الآیات)$/;
    const first = paras.findIndex(x => H.test(x)); if (first > 0) paras = paras.slice(first);
    const second = paras.findIndex((x, k) => k > 2 && H.test(x)); if (second > 0) paras = paras.slice(0, second);
    const range = e.a1 === e.a2 ? `تفسير الآية ${e.a1}` : `تفسير الآيات ${e.a1} – ${e.a2}`;
    return new Response(JSON.stringify({ ok: paras.length > 0, range, paras: paras.slice(0, 500), src: `https://books.rafed.net/view/${b}/page/${e.p}`, vol: e.v + 1, page: e.p }), { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=604800' } });
  } catch (x) { return err(String(x.message || x), 502) }
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
    if (url.pathname.replace(/\/$/, '') === '/api/shtaf') return shTafsir(url);
    if (url.pathname.replace(/\/$/, '') === '/api/rafed') return rafedApi(url);
    if (url.pathname.replace(/\/$/, '') === '/api/amthal') return amthalApi(url);
    if (url.pathname.replace(/\/$/, '') === '/api/ai') return aiHandler(request, env || {});
    if (url.pathname.replace(/\/$/, '') === '/api/acon') {
      const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9_]/gi, '');
      if (!id) return err('missing id', 400);
      try {
        const r = await fetch(`https://sites.dlib.nyu.edu/viewer/books/${id}/1?embed=1`, { headers: { 'user-agent': 'Mozilla/5.0 MidadReader/1.0' }, cf: { cacheTtl: 2592000, cacheEverything: true } });
        const t = await r.text(); const n = +((t.match(/data-sequence-count="(\d+)"/) || t.match(/class="sequence_count">(\d+)/) || [])[1] || 0);
        return new Response(JSON.stringify({ ok: !!n, id, n }), { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=2592000' } });
      } catch (e) { return err('acon failed', 502); }
    }
    if (url.pathname.startsWith('/api/r/')) { const u = new URL(request.url); u.pathname = '/api/fetch'; u.search = '?raw=1&u64=' + url.pathname.slice(7) + (url.searchParams.get('grep') ? '&grep=' + encodeURIComponent(url.searchParams.get('grep')) : '') + (url.searchParams.get('head') ? '&head=1' : ''); return onRequestGet({ request: new Request(u.toString()) }); }
    if (url.pathname === '/api/health') return new Response(JSON.stringify({ ok: true, server: 'midad' }), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    return env.ASSETS.fetch(request);
  }
};
