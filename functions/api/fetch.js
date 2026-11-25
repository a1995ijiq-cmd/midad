// خادم مداد: يجلب فهارس المكتبات (OPDS / JSON / RSS / HTML) نيابة عن التطبيق
// لأن أغلب المواقع ما تسمح للمتصفح يتصل بيها مباشرة (CORS).
const BLOCK = ['welib', 'annas-archive', 'annas-', 'libgen', 'library.lol', 'z-lib', 'zlib', '1lib', 'pdfdrive', 'sci-hub', 'b-ok', 'singlelogin'];
const MAX = 8 * 1024 * 1024;
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-final-url' };
const err = (msg, status) => new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get('url');
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
  } catch (e) { return err('fetch failed', 502); }

  if (BLOCK.some(b => r.url.toLowerCase().includes(b))) return err('blocked source', 403);
  const ct = r.headers.get('content-type') || 'application/octet-stream';
  if (!/xml|json|html|text|atom|opds/i.test(ct)) return err('unsupported content type', 415);
  if (+(r.headers.get('content-length') || 0) > MAX) return err('too large', 413);
  const body = await r.arrayBuffer();
  if (body.byteLength > MAX) return err('too large', 413);

  return new Response(body, {
    status: r.status,
    headers: { ...CORS, 'content-type': ct, 'cache-control': 'public, max-age=3600', 'x-final-url': r.url }
  });
}

export const onRequestOptions = () => new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'GET, OPTIONS' } });
