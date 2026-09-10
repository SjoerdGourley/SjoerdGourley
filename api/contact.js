/**
 * POST /api/contact
 *
 * Runs on Vercel's Node runtime. Deliberately dependency-free: the site is a
 * single static index.html with no package.json, and a contact form is not a
 * reason to introduce a build step. Both Resend and Supabase are called over
 * plain HTTPS with fetch.
 *
 * Order matters. The message is stored first and mailed second, so a Resend
 * outage loses a notification but never the message itself. `delivered`
 * records which of the two happened.
 *
 * Secrets live in Vercel's environment, never in this repo:
 *   RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = 'https://ezadbsekqvfzribcchek.supabase.co';
const TO = 'hello@sjoerdgourley.com';
const FROM = 'sjoerdgourley.com <noreply@sjoerdgourley.com>';

/** Bots fill every field they can see and they fill them instantly. */
const MIN_FILL_MS = 2000;
const LIMITS = { name: 120, email: 200, subject: 200, message: 5000 };

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Never store a raw IP: it is personal data and a salted hash triages spam just as well. */
async function hashIp(ip, salt) {
  if (!ip) return null;
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const { name, email, subject, message, company, ts } = body;

  // Honeypot. A real browser never sees this field, so anything in it is a bot.
  // Answer 200 so the bot records a success and does not retry with variations.
  if (company) return res.status(200).json({ ok: true });

  const elapsed = Number(ts) ? Date.now() - Number(ts) : Infinity;
  if (elapsed < MIN_FILL_MS) {
    return res.status(422).json({ ok: false, error: 'too_fast' });
  }

  for (const [field, max] of Object.entries(LIMITS)) {
    const value = body[field];
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(422).json({ ok: false, error: `missing_${field}` });
    }
    if (value.length > max) {
      return res.status(422).json({ ok: false, error: `too_long_${field}` });
    }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(422).json({ ok: false, error: 'bad_email' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
  const record = {
    name: name.trim(),
    email: email.trim(),
    subject: subject.trim(),
    message: message.trim(),
    user_agent: (req.headers['user-agent'] || '').slice(0, 500) || null,
    ip_hash: await hashIp(ip, serviceKey || 'no-salt'),
    delivered: false,
  };

  let rowId = null;
  if (serviceKey) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/contact_messages`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(record),
      });
      if (r.ok) {
        const [row] = await r.json();
        rowId = row && row.id;
      } else {
        console.error('supabase insert failed', r.status, await r.text());
      }
    } catch (err) {
      console.error('supabase insert threw', err && err.message);
    }
  }

  if (!resendKey) {
    // Stored but not announced. Better than pretending it was sent.
    return res.status(rowId ? 200 : 500).json({ ok: Boolean(rowId), stored: Boolean(rowId) });
  }

  let delivered = false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: record.email,
        subject: `sjoerdgourley.com — ${record.subject}`,
        text: [
          `From:    ${record.name} <${record.email}>`,
          `Subject: ${record.subject}`,
          '',
          record.message,
        ].join('\n'),
        html: `<p><strong>${esc(record.name)}</strong> &lt;${esc(record.email)}&gt;</p>
<p><em>${esc(record.subject)}</em></p>
<hr />
<p style="white-space:pre-wrap">${esc(record.message)}</p>`,
      }),
    });
    delivered = r.ok;
    if (!r.ok) console.error('resend failed', r.status, await r.text());
  } catch (err) {
    console.error('resend threw', err && err.message);
  }

  // Best effort: the message is already safe, this only corrects the flag.
  if (delivered && rowId && serviceKey) {
    fetch(`${SUPABASE_URL}/rest/v1/contact_messages?id=eq.${rowId}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ delivered: true }),
    }).catch(() => {});
  }

  if (!delivered && !rowId) {
    return res.status(500).json({ ok: false, error: 'not_stored_not_sent' });
  }
  return res.status(200).json({ ok: true, stored: Boolean(rowId), delivered });
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
