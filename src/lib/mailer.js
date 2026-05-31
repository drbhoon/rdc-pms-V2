/**
 * mailer.js — Nodemailer wrapper for sending RM / BH assessment links.
 *
 * Required Railway env vars:
 *   SMTP_HOST    e.g. smtp.gmail.com  OR  smtp.office365.com
 *   SMTP_PORT    587 (STARTTLS) or 465 (SSL)
 *   SMTP_USER    sender email address
 *   SMTP_PASS    app password / SMTP password
 *   SMTP_FROM    display name + address  e.g. "RDC PMS <pms@rdcconcrete.com>"
 *
 * If SMTP_HOST is not set, emails are skipped silently (safe for local dev).
 */
import nodemailer from 'nodemailer';

// Module-level pooled transporter — keeps a warm SMTP connection so repeated
// sends (bulk launch) don't cold-connect every time. Gmail flags rapid
// short-lived connections as "suspicious" and silently throttles.
let _transport = null;
function getTransport() {
  if (_transport) return _transport;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  _transport = nodemailer.createTransport({
    host,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Connection pooling — reuse TCP/TLS handshake across messages.
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    // Conservative time-outs so a hung SMTP can't pin the request forever.
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     20000,
  });
  return _transport;
}

// Verify SMTP creds on first call. Result cached so subsequent sends are
// fast. Returns null/error string — never throws.
let _verifyResult = null;
async function verifySmtp() {
  if (_verifyResult !== null) return _verifyResult;
  const t = getTransport();
  if (!t) { _verifyResult = 'SMTP_HOST not set'; return _verifyResult; }
  try {
    await t.verify();
    _verifyResult = '';   // empty string = OK
    return '';
  } catch (e) {
    _verifyResult = e.message || String(e);
    return _verifyResult;
  }
}
export { verifySmtp };

// Send with one retry on transient SMTP failures (rate-limit, DNS hiccup,
// connection reset). Resolves with { ok, attempts, error? }.
async function sendWithRetry(transport, mailOptions) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const info = await transport.sendMail(mailOptions);
      return { ok: true, attempts: attempt, messageId: info?.messageId };
    } catch (e) {
      lastErr = e;
      console.error(`[mailer] send attempt ${attempt} failed:`, e.code, e.message);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { ok: false, attempts: 2, error: lastErr?.message || String(lastErr) };
}

const from = () => process.env.SMTP_FROM || process.env.SMTP_USER || 'RDC PMS <noreply@rdcconcrete.com>';

// Extract the employee's actual job/designation role from the Employee
// Excel (EMP_ROLE column). Falls back through common variants and finally
// to the template roleKey so the column is never blank.
function employeeRoleFor(pair) {
  const pd = pair?.employee?.profileData || pair?.profileData || {};
  const candidates = [
    'EMP_ROLE', 'emp_role', 'Emp Role', 'EMP ROLE',
    'Role', 'ROLE', 'role',
    'Designation', 'DESIGNATION', 'designation',
  ];
  for (const k of candidates) {
    const v = pd[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return pair?.roleKey || '';
}

// ── RM notification (sent when pair is created) ───────────────────────────────
export async function sendRmLink({ rmName, rmEmail, empName, empCode, roleKey, cycle, formUrl }) {
  const transport = getTransport();
  if (!transport) {
    console.log('[mailer] SMTP not configured — skipping RM email to', rmEmail);
    return;
  }

  await transport.sendMail({
    from: from(),
    to:   rmEmail,
    subject: `Action Required: Assessment for ${empName} (${cycle})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;">
        <div style="background:#0f172a;border-radius:8px 8px 0 0;padding:16px 24px;">
          <span style="color:#fff;font-weight:700;font-size:18px;">RDC PARAKH</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:8px;">SYSTEM</span>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="margin:0 0 16px;">Dear <strong>${rmName}</strong>,</p>
          <p style="margin:0 0 16px;">Please complete the assessment for the following employee:</p>
          <table style="border-collapse:collapse;width:100%;margin-bottom:20px;font-size:14px;">
            <tr><td style="padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;width:140px;">Employee</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${empName} (${empCode})</td></tr>
            <tr><td style="padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Role</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${roleKey}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Cycle</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${cycle}</td></tr>
          </table>
          <div style="text-align:center;margin:24px 0;">
            <a href="${formUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">
              Open Assessment Form →
            </a>
          </div>
          <p style="font-size:12px;color:#94a3b8;margin:0;">This link is unique to you. Do not share it. If you have questions, contact your HR team.</p>
        </div>
      </div>
    `,
  });

  console.log('[mailer] RM email sent to', rmEmail, 'for', empName);
}

// ── BH notification (sent when RM submits) ────────────────────────────────────
export async function sendBhLink({ bhName, bhEmail, empName, empCode, roleKey, cycle, formUrl }) {
  const transport = getTransport();
  if (!transport) {
    console.log('[mailer] SMTP not configured — skipping BH email to', bhEmail);
    return;
  }

  await transport.sendMail({
    from: from(),
    to:   bhEmail,
    subject: `Review Required: Assessment for ${empName} (${cycle})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;">
        <div style="background:#0f172a;border-radius:8px 8px 0 0;padding:16px 24px;">
          <span style="color:#fff;font-weight:700;font-size:18px;">RDC PARAKH</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:8px;">SYSTEM</span>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="margin:0 0 16px;">Dear <strong>${bhName}</strong>,</p>
          <p style="margin:0 0 16px;">The RM has submitted their assessment. Please review and finalise:</p>
          <table style="border-collapse:collapse;width:100%;margin-bottom:20px;font-size:14px;">
            <tr><td style="padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;width:140px;">Employee</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${empName} (${empCode})</td></tr>
            <tr><td style="padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Role</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${roleKey}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Cycle</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${cycle}</td></tr>
          </table>
          <div style="text-align:center;margin:24px 0;">
            <a href="${formUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">
              Open Review Form →
            </a>
          </div>
          <p style="font-size:12px;color:#94a3b8;margin:0;">This link is unique to you. Do not share it. If you have questions, contact your HR team.</p>
        </div>
      </div>
    `,
  });

  console.log('[mailer] BH email sent to', bhEmail, 'for', empName);
}

// ── Batch RM email (one email listing all pending assessments + dashboard link) ──
export async function sendReviewerBatch({ to, name, role, roleLabel, cycle, pairs, dashboardUrl, isReminder = false }) {
  const transport = getTransport();
  if (!transport) {
    console.log('[mailer] SMTP not configured — skipping batch email to', to);
    return;
  }
  // Wording differs by role: SELF = employee filling about themselves,
  // RM = manager reviewing direct reports, BH = approver finalising.
  let roleWord, verb, btnColor, subject;
  if (role === 'SELF') {
    roleWord = 'Complete';
    verb     = 'complete your self-assessment for';
    btnColor = '#4f46e5'; // indigo to match the self form
    subject  = isReminder
      ? `Reminder: Self-Assessment Pending — ${roleLabel} · ${cycle}`
      : `Action Required: Self-Assessment — ${roleLabel} · ${cycle}`;
  } else if (role === 'BH') {
    roleWord = 'Review & Finalise';
    verb     = 'review and finalise';
    btnColor = '#059669';
    subject  = isReminder
      ? `Reminder: Pending Assessments — ${roleLabel} · ${cycle}`
      : `Review Required — ${roleLabel} · ${cycle}`;
  } else {
    roleWord = 'Complete';
    verb     = 'complete';
    btnColor = '#2563eb';
    subject  = isReminder
      ? `Reminder: Pending Assessments — ${roleLabel} · ${cycle}`
      : `Review Required — ${roleLabel} · ${cycle}`;
  }

  const tableRows = pairs.map((p, i) => `
    <tr>
      <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;">${i + 1}</td>
      <td style="padding:6px 12px;border:1px solid #e2e8f0;">
        <div style="font-weight:600;color:#1e293b;">${p.empName}</div>
        <div style="font-size:11px;color:#94a3b8;font-family:monospace;">${p.empCode}</div>
      </td>
      <td style="padding:6px 12px;border:1px solid #e2e8f0;color:#475569;">${employeeRoleFor(p)}</td>
      <td style="padding:6px 12px;border:1px solid #e2e8f0;color:#475569;">${p.cycle}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1e293b;">
      <div style="background:#0f172a;border-radius:8px 8px 0 0;padding:16px 24px;">
        <span style="color:#fff;font-weight:700;font-size:18px;">RDC PARAKH</span>
        <span style="color:#94a3b8;font-size:13px;margin-left:8px;">SYSTEM</span>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
        <p style="margin:0 0 12px;">Dear <strong>${name || to}</strong>,</p>
        <p style="margin:0 0 16px;">
          ${role === 'SELF'
            ? (isReminder
                ? `This is a reminder to ${verb} the assessment cycle:`
                : `You have been asked to ${verb} the assessment cycle:`)
            : (isReminder
                ? `This is a reminder that you have <strong>${pairs.length}</strong> pending assessment${pairs.length > 1 ? 's' : ''} to ${verb}:`
                : `You have been assigned <strong>${pairs.length}</strong> assessment${pairs.length > 1 ? 's' : ''} to ${verb}:`)}
        </p>
        <table style="border-collapse:collapse;width:100%;margin-bottom:20px;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;width:40px;color:#475569;">#</th>
              <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;color:#475569;">Name</th>
              <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;color:#475569;">Role</th>
              <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;color:#475569;">Cycle</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div style="text-align:center;margin:24px 0;">
          <a href="${dashboardUrl}" style="display:inline-block;background:${btnColor};color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">
            Open &amp; Review
          </a>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0;">
          One link — you'll see all your assessments. Click any name to open the form. This link is unique to you; please do not share it.
        </p>
      </div>
    </div>
  `;

  const sendResult = await sendWithRetry(transport, { from: from(), to, subject, html });

  // Audit-log every send attempt — success and failure both — so HR has a
  // permanent paper trail on the Audit page. This is the single source of
  // truth for "did this email actually fire".
  try {
    const { appendAudit } = await import('./queries.js');
    for (const p of pairs) {
      await appendAudit({
        action:      sendResult.ok ? 'INVITE_SENT' : 'INVITE_FAILED',
        pairId:      p.pairId,
        empCode:     p.empCode,
        empName:     p.empName,
        roleKey:     p.roleKey,
        cycle:       p.cycle,
        performedBy: 'mailer',
        details: {
          role,
          to,
          subject,
          isReminder,
          attempts:   sendResult.attempts,
          messageId:  sendResult.messageId || null,
          error:      sendResult.error    || null,
        },
      });
    }
  } catch (auditErr) {
    // Audit failure must NOT break email flow.
    console.error('[mailer] audit log write failed:', auditErr.message);
  }

  if (!sendResult.ok) {
    // Re-throw so runInvites' catch keeps the pair UNMARKED (next cron retries)
    throw new Error(sendResult.error || 'SMTP send failed after retry');
  }
  console.log(`[mailer] ${isReminder ? 'Reminder' : 'Batch'} ${role} email → ${to} (${pairs.length} pairs, ${sendResult.attempts} attempt${sendResult.attempts > 1 ? 's' : ''}, msgId=${sendResult.messageId || '—'})`);
}
