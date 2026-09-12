// Helpers shared by the prompt-page endpoints. The leading underscore keeps
// Vercel from routing this file.

const SUPABASE_URL = 'https://ezadbsekqvfzribcchek.supabase.co';
const SITE = 'https://sjoerdgourley.com';
const FROM = 'Sjoerd Gourley <hello@sjoerdgourley.com>';
const REPLY_TO = 'hello@sjoerdgourley.com';

const json = (res, status, body) => res.status(status).json(body);

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

const readBody = (req) =>
  typeof req.body === 'string' ? safeParse(req.body) : req.body || {};

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

// Salted SHA-256 prefix of the IP
async function hashIp(ip, salt) {
  if (!ip) return null;
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function token() {
  return require('crypto').randomBytes(24).toString('hex');
}

async function sb(path, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('no_service_key');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function sendMail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text, html }),
    });
    if (!r.ok) console.error('resend failed', r.status, await r.text());
    return r.ok;
  } catch (err) {
    console.error('resend threw', err && err.message);
    return false;
  }
}

// Mail layout in the site palette. Tables and inline styles because mail
// clients drop stylesheets and custom properties.
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

module.exports = {
  SUPABASE_URL, SITE, FROM, REPLY_TO,
  json, safeParse, readBody, esc, clientIp, hashIp, token, sb, sendMail, emailShell,
};
