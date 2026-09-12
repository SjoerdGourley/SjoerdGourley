// The email that carries the prompt itself, used by the signup route when a
// confirmed address asks again, and by the confirm route on first delivery.

const { esc, emailShell } = require('./_shared');

const promptHtml = (entry) =>
  emailShell(({ INK, MUTED, SUBTLE, TERTIARY, ACCENT, FONT, rule }) => `
    <tr><td style="padding:28px 28px 0;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${SUBTLE};">
      ${esc(entry.title)}
    </td></tr>
    <tr><td style="padding:16px 28px 0;font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${INK};">
      Here's the prompt
    </td></tr>
    <tr><td style="padding:12px 28px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${MUTED};">
      Paste it as is. What it gives back is a starting point, not a shipping decision, so the checklist underneath is the part that matters.
    </td></tr>
    <tr><td style="padding:22px 28px 0;">
      <pre style="margin:0;padding:18px;background:#1e1e1e;border:1px solid #3a3b3d;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.55;color:${INK};white-space:pre-wrap;">${esc(entry.prompt)}</pre>
    </td></tr>
    <tr><td style="padding:26px 28px 0;">${rule}</td></tr>
    <tr><td style="padding:22px 28px 0;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${SUBTLE};">
      What to check in the answer
    </td></tr>
    <tr><td style="padding:10px 28px 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${MUTED};">
      ${entry.checklist.map((c, i) => `<div style="padding:6px 0;"><span style="color:${ACCENT};font-weight:700;">${i + 1}.</span> ${esc(c)}</div>`).join('')}
    </td></tr>
    <tr><td style="padding:26px 28px 0;">${rule}</td></tr>
    <tr><td style="padding:18px 28px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:${TERTIARY};">
      Reply to this email if it does something strange. It reaches me, not a queue.
    </td></tr>`);

const promptText = (entry) =>
  [entry.title, '', entry.prompt, '', 'What to check in the answer:',
    ...entry.checklist.map((c, i) => `${i + 1}. ${c}`), '', '--',
    'Reply to this email if it does something strange.'].join('\n');

module.exports = { promptHtml, promptText };
