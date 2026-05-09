// apps/api/src/modules/notifications/notifications.service.ts
import nodemailer from 'nodemailer';

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export interface PinEmailOptions {
  to: string;
  recipientName: string;
  examTitle: string;
  unlockPin?: string;
  exitPin?: string;
}

export async function sendPinEmail(opts: PinEmailOptions): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[notifications] No SMTP configured — PIN email skipped');
    console.log(`  To: ${opts.to} | Unlock: ${opts.unlockPin} | Exit: ${opts.exitPin}`);
    return false;
  }

  const pinRows: string[] = [];
  if (opts.unlockPin) {
    pinRows.push(`
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Unlock PIN</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:24px;font-weight:700;letter-spacing:6px;color:#111827">${opts.unlockPin}</td>
      </tr>
    `);
  }
  if (opts.exitPin) {
    pinRows.push(`
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:14px">Exit PIN</td>
        <td style="padding:12px 16px;font-family:monospace;font-size:24px;font-weight:700;letter-spacing:6px;color:#111827">${opts.exitPin}</td>
      </tr>
    `);
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f9fafb;padding:40px 20px;margin:0">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <div style="background:#111827;padding:24px 32px">
          <h1 style="color:#fff;font-size:20px;margin:0">🔒 SecureExam</h1>
          <p style="color:#9ca3af;font-size:14px;margin:4px 0 0">Exam PIN Delivery</p>
        </div>
        <div style="padding:32px">
          <p style="color:#374151;font-size:15px;margin:0 0 8px">Hello ${opts.recipientName},</p>
          <p style="color:#374151;font-size:15px;margin:0 0 24px">
            Here are the secure PINs for <strong>${opts.examTitle}</strong>.
            Keep these confidential — share only with the invigilator on the day.
          </p>
          <table style="width:100%;border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;overflow:hidden">
            ${pinRows.join('')}
          </table>
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-top:20px">
            <p style="color:#92400e;font-size:13px;margin:0">
              ⚠ These PINs are single-use and expire when the exam ends.
              Do not forward this email.
            </p>
          </div>
        </div>
        <div style="border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center">
          <p style="color:#9ca3af;font-size:12px;margin:0">SecureExam · Automated message · Do not reply</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"SecureExam" <${process.env.EMAIL_FROM || 'noreply@school.edu'}>`,
      to: opts.to,
      subject: `Exam PINs — ${opts.examTitle}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[notifications] Email send failed:', err);
    return false;
  }
}

export async function sendProctorInviteEmail(opts: {
  to: string;
  inviteeName: string;
  inviterName: string;
  examTitle: string;
  schoolName: string;
  portalUrl: string;
}): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[notifications] Proctor invite skipped (no SMTP) — ${opts.to} invited to ${opts.examTitle}`);
    return false;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f9fafb;padding:40px 20px;margin:0">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <div style="background:#111827;padding:24px 32px">
          <h1 style="color:#fff;font-size:20px;margin:0">🔒 SecureExam</h1>
        </div>
        <div style="padding:32px">
          <p style="color:#374151;font-size:15px;margin:0 0 8px">Hello ${opts.inviteeName},</p>
          <p style="color:#374151;font-size:15px;margin:0 0 24px">
            <strong>${opts.inviterName}</strong> has invited you to co-proctor
            <strong>${opts.examTitle}</strong> at ${opts.schoolName}.
          </p>
          <p style="color:#374151;font-size:15px;margin:0 0 24px">
            You now have access to the live proctoring view and results for this exam.
          </p>
          <a href="${opts.portalUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
            Open Teacher Portal →
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"SecureExam" <${process.env.EMAIL_FROM || 'noreply@school.edu'}>`,
      to: opts.to,
      subject: `You've been invited to co-proctor: ${opts.examTitle}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[notifications] Invite email failed:', err);
    return false;
  }
}
