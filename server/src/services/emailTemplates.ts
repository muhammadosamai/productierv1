const BRAND_COLOR = '#4857FE'
const BRAND_COLOR_HOVER = '#3a47d4'

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8faff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8faff">
<tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden">
<tr><td style="padding:32px 36px 0">
  <img src="cid:logo" alt="Productier" width="40" height="40" style="border-radius:12px;display:block;margin-bottom:24px" />
</td></tr>
<tr><td style="padding:0 36px 36px">
${content}
</td></tr>
</table>
<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">
  &copy; ${new Date().getFullYear()} Productier. All rights reserved.
</p>
</td></tr>
</table>
</body>
</html>`
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0">
<tr><td style="background-color:${BRAND_COLOR};border-radius:8px;text-align:center">
  <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;color:#fff;font-size:14px;font-weight:600;text-decoration:none">
    ${label}
  </a>
</td></tr>
</table>`
}

export function inviteTemplate(params: {
  productName: string
  inviterName: string
  role: string
  acceptUrl: string
}): { subject: string; html: string } {
  const { productName, inviterName, role, acceptUrl } = params
  return {
    subject: `You've been invited to join ${productName} on Productier`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">You're invited!</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6">
        <strong style="color:#111827">${inviterName}</strong> has invited you to join
        <strong style="color:#111827">${productName}</strong> as a <strong style="color:${BRAND_COLOR}">${role}</strong>.
      </p>
      ${button('Accept Invitation', acceptUrl)}
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    `),
  }
}

export function passwordResetTemplate(params: {
  userName: string
  resetUrl: string
}): { subject: string; html: string } {
  const { userName, resetUrl } = params
  return {
    subject: 'Reset your Productier password',
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Password Reset</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6">
        Hi <strong style="color:#111827">${userName}</strong>, we received a request to reset your password.
        Click the button below to choose a new one.
      </p>
      ${button('Reset Password', resetUrl)}
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5">
        This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
      </p>
    `),
  }
}

export function welcomeTemplate(params: {
  userName: string
  loginUrl: string
}): { subject: string; html: string } {
  const { userName, loginUrl } = params
  return {
    subject: 'Welcome to Productier!',
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Welcome aboard!</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6">
        Hi <strong style="color:#111827">${userName}</strong>, your Productier account has been created.
        You're all set to start managing your products, stories, and deliveries.
      </p>
      ${button('Go to Productier', loginUrl)}
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5">
        Need help getting started? Reply to this email and we'll be happy to assist.
      </p>
    `),
  }
}

export function notificationTemplate(params: {
  userName: string
  eventType: 'assigned' | 'status_change' | 'comment' | 'deadline'
  entityType: string
  entityTitle: string
  entityUrl: string
  actorName: string
  details?: string
}): { subject: string; html: string } {
  const { userName, eventType, entityType, entityTitle, entityUrl, actorName, details } = params

  const subjects: Record<string, string> = {
    assigned: `You've been assigned to a ${entityType}: ${entityTitle}`,
    status_change: `${entityType} status updated: ${entityTitle}`,
    comment: `New comment on ${entityType}: ${entityTitle}`,
    deadline: `Upcoming deadline: ${entityTitle}`,
  }

  const descriptions: Record<string, string> = {
    assigned: `<strong style="color:#111827">${actorName}</strong> assigned you to this ${entityType}.`,
    status_change: `<strong style="color:#111827">${actorName}</strong> updated the status${details ? ` to <strong style="color:${BRAND_COLOR}">${details}</strong>` : ''}.`,
    comment: `<strong style="color:#111827">${actorName}</strong> left a comment${details ? `:<br/><div style="margin:12px 0;padding:12px 16px;background:#f3f4f6;border-radius:8px;font-size:14px;color:#374151;line-height:1.5">${details}</div>` : '.'}`,
    deadline: `This ${entityType} is due soon.${details ? ` Due: <strong style="color:#111827">${details}</strong>.` : ''}`,
  }

  return {
    subject: subjects[eventType] || `Notification: ${entityTitle}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">${entityTitle}</h1>
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.05em">${entityType}</p>
      <p style="margin:12px 0 20px;font-size:15px;color:#6b7280;line-height:1.6">
        Hi <strong style="color:#111827">${userName}</strong>, ${descriptions[eventType]}
      </p>
      ${button(`View ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`, entityUrl)}
    `),
  }
}
