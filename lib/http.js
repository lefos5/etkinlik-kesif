// Vercel serverless icin kucuk yardimcilar: JSON yanit, CORS, hata sarma.

export function json(res, status, body) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.status(status).send(JSON.stringify(body));
}

/** OPTIONS (preflight) ise true doner ve yaniti kapatir. */
export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
  return false;
}

/** Handler'i try/catch ile sarar — hatalari 500 JSON'a cevirir. */
export function withErrors(handler) {
  return async (req, res) => {
    try {
      if (handlePreflight(req, res)) return;
      await handler(req, res);
    } catch (e) {
      console.error(e);
      json(res, 500, { error: e.message || 'Sunucu hatasi' });
    }
  };
}
