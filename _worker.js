// خادم مداد (وضع Pages المتقدم): يمرر /api/fetch للمعالج، وباقي الطلبات للملفات الثابتة
import { onRequestGet, onRequestOptions } from './functions/api/fetch.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fetch' || url.pathname === '/api/fetch/') {
      if (request.method === 'OPTIONS') return onRequestOptions();
      if (request.method === 'GET') return onRequestGet({ request, env, ctx });
      return new Response('method not allowed', { status: 405 });
    }
    if (url.pathname === '/api/health') return new Response(JSON.stringify({ ok: true, server: 'midad' }), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    return env.ASSETS.fetch(request);
  }
};
