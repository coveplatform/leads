// Trial follow-up email templates and sending logic

const BASE = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;padding:40px 32px;color:#18181b">
    <div style="margin-bottom:28px">
      <span style="font-size:1.1rem;font-weight:800;letter-spacing:-.03em;color:#0e0c0a">cove</span>
    </div>
    {{BODY}}
    <div style="border-top:1px solid #e4e4e7;margin-top:36px;padding-top:20px;font-size:.78rem;color:#a1a1aa;line-height:1.6">
      Cove Platform Pty Ltd (ABN 21 639 191 602) · Melbourne, Australia<br/>
      <a href="mailto:hello@usecove.app" style="color:#a1a1aa">hello@usecove.app</a> ·
      <a href="https://usecove.app" style="color:#a1a1aa">usecove.app</a><br/>
      You're receiving this because you created a Cove account.
      <a href="mailto:hello@usecove.app?subject=Unsubscribe" style="color:#a1a1aa">Unsubscribe</a>
    </div>
  </div>
`;

function wrap(body) {
  return BASE.replace("{{BODY}}", body);
}

// ─── Day 1: activation → call forwarding nudge ───
export function day1Email({ name, bizName, coveNumber }) {
  const displayNum = coveNumber || "your Cove number";
  const localNum = coveNumber?.startsWith("+61") ? "0" + coveNumber.slice(3) : coveNumber;
  const telstraCode = coveNumber ? `**61*${coveNumber}*11*20#` : "**61*+XXXXXXXXXX*11*20#";
  const firstName = name?.split(" ")[0] || "there";

  const subject = "One step left — forward your calls to Cove";

  const html = wrap(`
    <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-.04em;color:#0e0c0a;margin:0 0 8px">
      You're set up, ${firstName}. One step to go.
    </h2>
    <p style="color:#52525b;font-size:.92rem;line-height:1.65;margin:0 0 24px">
      Your Cove number is live — <strong style="color:#0e0c0a">${displayNum}</strong>.<br/>
      The last step is forwarding missed calls to it. Once that's done, every missed call triggers an automatic text to your lead.
    </p>

    <div style="background:#fff2ea;border:1px solid #fbcaaa;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e8540a;margin-bottom:10px">Telstra — 30 seconds</div>
      <ol style="margin:0;padding-left:20px;font-size:.88rem;color:#3f3f46;line-height:2">
        <li>Open your <strong>Phone app</strong> → dial pad</li>
        <li>Dial <strong style="font-family:monospace;color:#e8540a">${telstraCode}</strong> and tap <strong>Call</strong></li>
        <li>You'll hear a confirmation tone. Done.</li>
      </ol>
    </div>

    <p style="color:#71717a;font-size:.85rem;line-height:1.6;margin:0 0 24px">
      On Optus or Vodafone? <a href="https://usecove.app/dashboard" style="color:#e8540a;font-weight:600">Log in to your dashboard</a> → Integrations for your carrier's instructions.
    </p>

    <a href="https://usecove.app/dashboard" style="display:inline-block;background:#e8540a;color:#fff;font-size:.9rem;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
      Go to dashboard →
    </a>
  `);

  const text = `Hi ${firstName},\n\nYour Cove number is live: ${displayNum}\n\nOne step left — set up call forwarding so missed calls trigger the SMS flow automatically.\n\nTelstra: Dial ${telstraCode} and tap Call.\n\nFor Optus or Vodafone, log in to your dashboard → Integrations.\n\nhttps://usecove.app/dashboard\n\n— The Cove team`;

  return { subject, html, text };
}

// ─── Day 4: no leads yet nudge ───
export function day4Email({ name, bizName }) {
  const firstName = name?.split(" ")[0] || "there";

  const subject = "No leads yet — let's check your setup";

  const html = wrap(`
    <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-.04em;color:#0e0c0a;margin:0 0 8px">
      No leads yet, ${firstName} — let's fix that.
    </h2>
    <p style="color:#52525b;font-size:.92rem;line-height:1.65;margin:0 0 20px">
      It's been a few days and Cove hasn't captured a lead yet. This almost always means call forwarding isn't active — once that's set up, it works immediately.
    </p>

    <div style="background:#f8f8fa;border:1px solid #e4e4e7;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <div style="font-weight:700;font-size:.9rem;color:#18181b;margin-bottom:8px">Quick checklist:</div>
      <ul style="margin:0;padding-left:18px;font-size:.88rem;color:#3f3f46;line-height:2.1">
        <li>Is call forwarding set up on your mobile? <a href="https://usecove.app/dashboard" style="color:#e8540a">See instructions →</a></li>
        <li>Did you add your mobile number to receive lead alerts?</li>
        <li>Have you had any missed calls in the last 4 days?</li>
      </ul>
    </div>

    <p style="color:#71717a;font-size:.85rem;line-height:1.6;margin:0 0 24px">
      If you're stuck, just reply to this email. We'll sort it out in 5 minutes.
    </p>

    <a href="https://usecove.app/dashboard" style="display:inline-block;background:#e8540a;color:#fff;font-size:.9rem;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
      Check my setup →
    </a>
  `);

  const text = `Hi ${firstName},\n\nA few days in and no leads captured yet — this usually means call forwarding isn't active.\n\nQuick checklist:\n- Is call forwarding set up on your mobile?\n- Did you add your mobile number for lead alerts?\n- Have you had any missed calls in the last 4 days?\n\nLog in to check: https://usecove.app/dashboard\n\nIf you're stuck, reply to this email.\n\n— The Cove team`;

  return { subject, html, text };
}

// ─── Day 11: trial ending in 3 days ───
export function day11Email({ name, bizName, leadCount }) {
  const firstName = name?.split(" ")[0] || "there";
  const hasLeads = leadCount > 0;

  const subject = hasLeads
    ? `Your trial ends in 3 days — ${leadCount} lead${leadCount === 1 ? "" : "s"} captured`
    : "Your Cove trial ends in 3 days";

  const html = wrap(`
    <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-.04em;color:#0e0c0a;margin:0 0 8px">
      Your trial ends in 3 days, ${firstName}.
    </h2>

    ${hasLeads ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:1.8rem;font-weight:900;color:#16a34a;letter-spacing:-.04em">${leadCount}</div>
      <div style="font-size:.82rem;color:#15803d;font-weight:600">lead${leadCount === 1 ? "" : "s"} captured during your trial</div>
    </div>
    ` : `
    <p style="color:#52525b;font-size:.92rem;line-height:1.65;margin:0 0 20px">
      Cove hasn't captured any leads yet — if call forwarding isn't set up, it won't. <a href="https://usecove.app/dashboard" style="color:#e8540a">Log in and check your setup</a> before your trial ends.
    </p>
    `}

    <p style="color:#52525b;font-size:.92rem;line-height:1.65;margin:0 0 24px">
      After your trial, Cove is <strong>$89/month</strong>. Your card will be charged automatically unless you cancel before the trial ends.
    </p>

    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <a href="https://usecove.app/dashboard" style="display:inline-block;background:#e8540a;color:#fff;font-size:.9rem;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
        Go to dashboard →
      </a>
      <a href="https://usecove.app/dashboard" style="display:inline-block;background:#f4f4f5;color:#52525b;font-size:.9rem;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">
        Manage billing
      </a>
    </div>
  `);

  const text = `Hi ${firstName},\n\nYour Cove trial ends in 3 days.\n\n${hasLeads ? `You've captured ${leadCount} lead${leadCount === 1 ? "" : "s"} during your trial.` : "Cove hasn't captured any leads yet — check your setup before the trial ends."}\n\nAfter your trial, Cove is $89/month. Your card will be charged automatically unless you cancel.\n\nhttps://usecove.app/dashboard\n\n— The Cove team`;

  return { subject, html, text };
}
