// Minimal Mercado Pago mock (Orders API, Checkout Pro) for local tests, port 8811. Run:
//   node scripts/mp-mock.mjs
//   npx wrangler dev --port 8800 --var MP_ACCESS_TOKEN:TEST-123 --var MP_API_URL:http://127.0.0.1:8811 --var MP_WEBHOOK_SECRET:s3cret
// GET /_pay/<order_id>/<approved|rejected|pending> simulates the buyer paying.
// Shapes follow https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-pro/create-order/post
import http from 'node:http';
const orders = {};
let n = 0;
const oid = () => 'ORDTST01' + Date.now().toString(36).toUpperCase() + String(++n).padStart(4, '0');

http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const url = new URL(req.url, 'http://x');
    let m = url.pathname.match(/^\/_pay\/([A-Z0-9]+)\/(\w+)$/);
    if (m) {
      const o = orders[m[1]];
      if (!o) return send(404, {});
      const [status, detail] = { approved: ['processed', 'accredited'], rejected: ['failed', 'rejected_by_issuer'], pending: ['processing', 'pending_review_manual'] }[m[2]];
      Object.assign(o, { status, status_detail: detail, total_paid_amount: status === 'processed' ? o.total_amount : '0', last_updated_date: new Date().toISOString(),
        transactions: { payments: [{ id: 'PAY01' + o.id.slice(8), amount: o.total_amount, paid_amount: o.total_paid_amount, status, status_detail: detail, payment_method: { id: 'master', type: 'credit_card', installments: 1 } }] } });
      return send(200, o);
    }
    if (!/^Bearer (TEST|APP_USR)-/.test(req.headers.authorization || '')) return send(401, { errors: [{ code: 'unauthorized', message: 'invalid access token' }] });
    if (req.method === 'POST' && url.pathname === '/v1/orders') {
      if (!req.headers['x-idempotency-key']) return send(400, { errors: [{ code: 'empty_required_header', message: 'X-Idempotency-Key required' }] });
      const p = JSON.parse(b);
      for (const k of ['type', 'processing_mode', 'total_amount']) if (!p[k]) return send(400, { errors: [{ code: 'required_properties', message: k }] });
      if (p.type !== 'online' || p.processing_mode !== 'manual') return send(400, { errors: [{ code: 'property_value', message: 'type/processing_mode' }] });
      if (typeof p.total_amount !== 'string' || !/^\d+$/.test(p.total_amount)) return send(400, { errors: [{ code: 'property_type', message: 'total_amount must be a whole-number string' }] });
      const sum = (p.items || []).reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
      if (p.items && sum !== Number(p.total_amount)) return send(400, { errors: [{ code: 'order_items_total_amount_mismatch', message: 'mismatch' }] });
      if (p.external_reference && !/^[A-Za-z0-9_-]{1,64}$/.test(p.external_reference)) return send(400, { errors: [{ code: 'property_value', message: 'external_reference' }] });
      const id = oid();
      const now = new Date().toISOString();
      orders[id] = { id, type: 'online', processing_mode: 'manual', status: 'created', status_detail: 'created', capture_mode: 'automatic_async',
        external_reference: p.external_reference, description: p.description, total_amount: p.total_amount, total_paid_amount: '0',
        checkout_url: `https://www.mercadopago.cl/checkout/v1/redirect?order_id=${id}`, expiration_time: p.expiration_time || 'P1D',
        country_code: 'CHL', currency: 'CLP', created_date: now, last_updated_date: now, config: p.config, items: p.items };
      console.log('ORDER', JSON.stringify(p));
      return send(201, orders[id]);
    }
    m = url.pathname.match(/^\/v1\/orders\/([A-Z0-9]+)$/);
    if (req.method === 'GET' && m) return orders[m[1]] ? send(200, orders[m[1]]) : send(404, { errors: [{ code: 'not_found' }] });
    send(404, { errors: [{ code: 'not_found' }] });
  });
}).listen(8811, () => console.log('mercado pago mock on :8811'));
