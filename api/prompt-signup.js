// POST /api/prompt-signup: start the double opt-in for one video's prompt

const { json, readBody, esc, clientIp, hashIp, token, sb, sendMail, emailShell, SITE } = require('./_shared');
const { PROMPTS } = require('./_prompts');
const { promptHtml, promptText } = require('./_mail-prompt');

const MIN_FILL_MS = 2000;
const MAX_PER_IP_PER_HOUR = 10;

const optInHtml = (entry, link) =>
  emailShell(({ INK, MUTED, SUBTLE, TERTIARY, ACCENT, FONT, rule }) => `
    <tr><td style="padding:28px 28px 0;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${SUBTLE};">
      One click left
    </td></tr>
    <tr><td style="padding:16px 28px 0;font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${INK};">
      Confirm and I'll send the prompt
    </td></tr>
    <tr><td style="padding:12px 28px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${MUTED};">
      You asked for the prompt behind <strong style="color:${INK};">${esc(entry.title)}</strong>. Confirm this address and it arrives straight after.
    </td></tr>
    <tr><td style="padding:24px 28px 0;font-family:${FONT};font-size:15px;">
      <a href="${link}" style="display:inline-block;background:#1c5d99;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Send me the prompt</a>
    </td></tr>
    <tr><td style="padding:22px 28px 0;">${rule}</td></tr>
    <tr><td style="padding:18px 28px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:${TERTIARY};">
      Didn't ask for this? Ignore this email and nothing happens. The link is
      <a href="${link}" style="color:${ACCENT};">${link}</a>
    </td></tr>`);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const { email, slug, ts, company } = readBody(req);

  if (company) return json(res, 200, { ok: true, state: 'pending' });

  const elapsed = Number(ts) ? Date.now() - Number(ts) : Infinity;
  if (elapsed < MIN_FILL_MS) return json(res, 422, { ok: false, error: 'too_fast' });

  const entry = PROMPTS[slug];
  if (!entry) return json(res, 404, { ok: false, error: 'unknown_slug' });

  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(res, 422, { ok: false, error: 'bad_email' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json(res, 500, { ok: false, error: 'not_configured' });

  const address = email.trim().toLowerCase();
  const ipHash = await hashIp(clientIp(req), serviceKey);

  try {
    if (ipHash) {
      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      const r = await sb(
        `prompt_signups?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id`,
        { headers: { Prefer: 'count=exact', Range: '0-0' } });
      const total = Number((r.headers.get('content-range') || '/0').split('/')[1]);
      if (total >= MAX_PER_IP_PER_HOUR) {
        return json(res, 429, { ok: false, error: 'too_many' });
      }
    }

    const existing = await sb(
      `prompt_signups?email=eq.${encodeURIComponent(address)}&slug=eq.${encodeURIComponent(slug)}&select=id,confirmed`);
    const [row] = existing.ok ? await existing.json() : [];

    if (row && row.confirmed) {
      const sent = await sendMail({
        to: address,
        subject: `The prompt: ${entry.title}`,
        text: promptText(entry),
        html: promptHtml(entry),
      });
      if (sent) {
        await sb(`prompt_signups?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ delivered: true, delivered_at: new Date().toISOString() }),
        });
      }
      return json(res, 200, { ok: true, state: 'resent' });
    }

    const confirmToken = token();
    const link = `${SITE}/api/prompt-confirm?token=${confirmToken}`;
    const record = {
      email: address,
      slug,
      confirm_token: confirmToken,
      user_agent: (req.headers['user-agent'] || '').slice(0, 500) || null,
      ip_hash: ipHash,
    };

    if (row) {
      await sb(`prompt_signups?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ confirm_token: confirmToken, user_agent: record.user_agent, ip_hash: ipHash }),
      });
    } else {
      const insert = await sb('prompt_signups', { method: 'POST', body: JSON.stringify(record) });
      if (!insert.ok) {
        console.error('signup insert failed', insert.status, await insert.text());
        return json(res, 500, { ok: false, error: 'not_stored' });
      }
    }

    await sendMail({
      to: address,
      subject: `Confirm and I'll send the prompt`,
      text: `You asked for the prompt behind ${entry.title}.\n\nConfirm here and it arrives straight after:\n${link}\n\nDidn't ask for this? Ignore this email and nothing happens.`,
      html: optInHtml(entry, link),
    });

    return json(res, 200, { ok: true, state: 'pending' });
  } catch (err) {
    console.error('prompt-signup threw', err && err.message);
    return json(res, 500, { ok: false, error: 'failed' });
  }
};
