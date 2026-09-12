// GET /api/prompt-confirm?token=...: confirm the address and deliver the prompt

const { sb, sendMail, SITE } = require('./_shared');
const { PROMPTS } = require('./_prompts');
const { promptHtml, promptText } = require('./_mail-prompt');

const page = (title, body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/style.css" />
</head>
<body class="prompt-page">
  <main class="prompt-shell">
    <div class="prompt-card">
      <div class="eyebrow">Sjoerd Gourley</div>
      <h1>${title}</h1>
      <p>${body}</p>
      <a href="/" class="arrow-pill">Back to the site<span class="ar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
        </svg></span></a>
    </div>
  </main>
</body></html>`;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const token = String((req.query && req.query.token) || '').trim();
  const send = (status, html) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(status).send(html);
  };

  if (!/^[a-f0-9]{48}$/.test(token)) {
    return send(400, page('That link looks wrong', 'Ask for the prompt again and a fresh link comes your way.'));
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(500, page('Not available right now', 'Something on my side is misconfigured. Mail hello@sjoerdgourley.com and I will send the prompt by hand.'));
  }

  try {
    const found = await sb(`prompt_signups?confirm_token=eq.${token}&select=id,email,slug,confirmed,delivered`);
    const [row] = found.ok ? await found.json() : [];

    if (!row) {
      return send(404, page('That link has already been used', 'Ask for the prompt again and a fresh link comes your way.'));
    }

    const entry = PROMPTS[row.slug];
    if (!entry) {
      return send(404, page('That prompt is gone', 'The video it belonged to is no longer listed. Mail hello@sjoerdgourley.com if you were looking for it.'));
    }

    if (row.confirmed && row.delivered) {
      return send(200, page('Already sent', `The prompt behind ${entry.title} is in your inbox. Search for "Here's the prompt".`));
    }

    const delivered = await sendMail({
      to: row.email,
      subject: `The prompt: ${entry.title}`,
      text: promptText(entry),
      html: promptHtml(entry),
    });

    await sb(`prompt_signups?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        delivered,
        delivered_at: delivered ? new Date().toISOString() : null,
      }),
    });

    if (!delivered) {
      return send(500, page('Confirmed, but the email did not go out', 'Mail hello@sjoerdgourley.com and I will send the prompt by hand.'));
    }

    return send(200, page('Check your inbox', `The prompt behind ${entry.title} is on its way.`));
  } catch (err) {
    console.error('prompt-confirm threw', err && err.message);
    return send(500, page('Something broke', 'Mail hello@sjoerdgourley.com and I will send the prompt by hand.'));
  }
};
