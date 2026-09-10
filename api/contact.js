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
// The confirmation goes out as hello@ rather than noreply@: it invites a reply,
// and a From nobody can answer would contradict that in the same breath.
const FROM_REPLY = 'Sjoerd Gourley <hello@sjoerdgourley.com>';

// A form that mails an address the visitor types is usable to send unsolicited
// post from this domain. These caps gate the confirmation only; the
// notification to Sjoerd always goes out.
// Per address is the cap that protects a person from being mailed repeatedly.
// Per network is the blunter one, and it has to stay loose: an office, a cafe
// or a mobile carrier puts many unrelated people behind one address, and three
// an hour would silently punish the third of them.
const CONFIRM_PER_IP_PER_HOUR = 10;
const CONFIRM_PER_EMAIL_PER_DAY = 2;

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

/**
 * The notification, in the site's own palette.
 *
 * Tables and inline styles throughout: mail clients routinely drop <style>
 * blocks, flexbox and grid, and none of them understand CSS custom properties,
 * so the tokens are written out literally. No webfont either -- a system stack
 * is what actually renders, and Inter would silently fall back anyway.
 */
function emailShell(rowsHtml) {
  const CANVAS = '#222222';
  const SURFACE = '#282828';
  const LINE = '#3a3b3d';
  const INK = '#ffffff';
  const MUTED = '#bbcde5';
  const SUBTLE = '#8f9aa8';
  const TERTIARY = '#6b7480';
  const ACCENT = '#639fab';
  const FONT =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const rule = `<div style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:600px;background:${SURFACE};border:1px solid ${LINE};border-radius:12px;">
    ${rowsHtml({ INK, MUTED, SUBTLE, TERTIARY, ACCENT, FONT, rule })}
  </table>
</td></tr>
</table>
</body></html>`;
}

/** What lands in Sjoerd's inbox. */
const notifyHtml = (m) =>
  emailShell(({ INK, MUTED, SUBTLE, TERTIARY, ACCENT, FONT, rule }) => `
    <tr><td style="padding:28px 28px 0;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${SUBTLE};">
      New message
    </td></tr>
    <tr><td style="padding:16px 28px 0;font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${INK};">
      ${esc(m.name)}
    </td></tr>
    <tr><td style="padding:6px 28px 0;font-family:${FONT};font-size:14px;">
      <a href="mailto:${esc(m.email)}" style="color:${ACCENT};text-decoration:none;">${esc(m.email)}</a>
    </td></tr>
    <tr><td style="padding:22px 28px 0;">${rule}</td></tr>
    <tr><td style="padding:22px 28px 0;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${SUBTLE};">
      What it's about
    </td></tr>
    <tr><td style="padding:8px 28px 0;font-family:${FONT};font-size:16px;color:${INK};">
      ${esc(m.subject)}
    </td></tr>
    <tr><td style="padding:24px 28px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${MUTED};white-space:pre-wrap;">${esc(m.message)}</td></tr>
    <tr><td style="padding:28px 28px 0;">${rule}</td></tr>
    <tr><td style="padding:18px 28px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:${TERTIARY};">
      Sent from the contact form on sjoerdgourley.com. Reply straight to this
      message and it reaches ${esc(m.name)}.
    </td></tr>`);

/** What lands in the sender's inbox. One per submission. */
const confirmHtml = (m) =>
  emailShell(({ INK, MUTED, SUBTLE, TERTIARY, FONT, rule }) => `
    <tr><td style="padding:28px 28px 0;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${SUBTLE};">
      Message received
    </td></tr>
    <tr><td style="padding:16px 28px 0;font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${INK};">
      Got it, ${esc(m.name.split(' ')[0])}.
    </td></tr>
    <tr><td style="padding:12px 28px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${MUTED};">
      Your message reached me. I read everything and I answer in English or Dutch.
    </td></tr>
    <tr><td style="padding:24px 28px 0;">${rule}</td></tr>
    <tr><td style="padding:22px 28px 0;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${SUBTLE};">
      What you sent
    </td></tr>
    <tr><td style="padding:10px 28px 0;font-family:${FONT};font-size:16px;color:${INK};">
      ${esc(m.subject)}
    </td></tr>
    <tr><td style="padding:14px 28px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${MUTED};white-space:pre-wrap;">${esc(m.message)}</td></tr>
    <tr><td style="padding:28px 28px 0;">${rule}</td></tr>
    <tr><td style="padding:18px 28px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:${TERTIARY};">
      Forgot something? Reply to this email and it lands in the same place.
    </td></tr>`);

/**
 * How many confirmations this address and this network already triggered.
 * One request, counted in JS. The row just inserted is excluded.
 */
async function recentConfirms(serviceKey, email, ipHash, excludeId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // Count confirmations actually sent, not submissions. Counting submissions
  // made the limit self-reinforcing: a suppressed attempt still incremented it.
  const filters = [`created_at=gte.${since}`, 'confirmed=eq.true',
                   'select=email,ip_hash,created_at'];
  if (excludeId) filters.push(`id=neq.${excludeId}`);
  const or = ipHash
    ? `or=(email.eq.${encodeURIComponent(email)},ip_hash.eq.${ipHash})`
    : `email=eq.${encodeURIComponent(email)}`;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/contact_messages?${or}&${filters.join('&')}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!r.ok) return { perEmail: 0, perIp: 0 };
    const rows = await r.json();
    const hourAgo = Date.now() - 3600 * 1000;
    return {
      perEmail: rows.filter((x) => x.email === email).length,
      perIp: ipHash
        ? rows.filter((x) => x.ip_hash === ipHash && Date.parse(x.created_at) > hourAgo).length
        : 0,
    };
  } catch {
    // Unknown means unknown: do not let a failed lookup open the gate.
    return { perEmail: Infinity, perIp: Infinity };
  }
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
        subject: `sjoerdgourley.com · ${record.subject}`,
        text: [
          `From:    ${record.name} <${record.email}>`,
          `Subject: ${record.subject}`,
          '',
          record.message,
          '',
          '--',
          'Sent from the contact form on sjoerdgourley.com',
        ].join('\n'),
        html: notifyHtml(record),
      }),
    });
    delivered = r.ok;
    if (!r.ok) console.error('resend failed', r.status, await r.text());
  } catch (err) {
    console.error('resend threw', err && err.message);
  }

  // Receipt for the sender, only once the notification actually went out:
  // confirming receipt of something Sjoerd never got would be a lie. Capped,
  // because the address comes from whoever filled the form and this is the one
  // place the site mails a stranger on request.
  let confirmed = false;
  if (delivered && serviceKey) {
    const seen = await recentConfirms(serviceKey, record.email, record.ip_hash, rowId);
    if (seen.perEmail < CONFIRM_PER_EMAIL_PER_DAY && seen.perIp < CONFIRM_PER_IP_PER_HOUR) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_REPLY,
            to: [record.email],
            reply_to: TO,
            subject: `Got your message \u00b7 ${record.subject}`,
            text: [
              `Got it, ${record.name.split(' ')[0]}.`,
              '',
              'Your message reached me. I read everything and I answer in English or Dutch.',
              '',
              `What you sent: ${record.subject}`,
              '',
              record.message,
              '',
              '--',
              'Forgot something? Reply to this email and it lands in the same place.',
            ].join('\n'),
            html: confirmHtml(record),
          }),
        });
        confirmed = r.ok;
        if (!r.ok) console.error('confirmation failed', r.status, await r.text());
      } catch (err) {
        console.error('confirmation threw', err && err.message);
      }
    } else {
      console.warn('confirmation suppressed by rate limit', seen);
    }
  }

  // One write for both flags, and it must be awaited: Vercel freezes the
  // process the moment the response is sent, so a fire-and-forget fetch here
  // never lands. confirmed is what the next request's rate limit reads, so
  // losing it would let the cap drift open.
  if (rowId && serviceKey && (delivered || confirmed)) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/contact_messages?id=eq.${rowId}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ delivered, confirmed }),
      });
    } catch (err) {
      console.error('flag patch failed', err && err.message);
    }
  }

  if (!delivered && !rowId) {
    return res.status(500).json({ ok: false, error: 'not_stored_not_sent' });
  }
  return res.status(200).json({ ok: true, stored: Boolean(rowId), delivered, confirmed });
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
