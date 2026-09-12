// POST /api/hit: server-side page counter for the prompt pages, no cookies

const { json, readBody, clientIp, hashIp, sb } = require('./_shared');
const { PROMPTS } = require('./_prompts');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false });
  }

  const { slug } = readBody(req);
  if (!PROMPTS[slug]) return json(res, 404, { ok: false });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(204).end();

  try {
    await sb('page_views', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        ip_hash: await hashIp(clientIp(req), serviceKey),
        user_agent: (req.headers['user-agent'] || '').slice(0, 500) || null,
        referrer: (req.headers.referer || '').slice(0, 500) || null,
      }),
    });
  } catch (err) {
    console.error('hit threw', err && err.message);
  }
  return res.status(204).end();
};
