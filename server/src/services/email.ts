import sgMail from '@sendgrid/mail'
import {
  inviteTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  notificationTemplate,
} from './emailTemplates'

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@productier.com'
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY)
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.log(`[Email] (no API key) To: ${to} | Subject: ${subject}`)
    return false
  }

  try {
    await sgMail.send({ to, from: FROM_EMAIL, subject, html })
    return true
  } catch (err: any) {
    console.error(`[Email] Failed to send to ${to}:`, err?.response?.body || err.message)
    return false
  }
}

export function getAppUrl(): string {
  return APP_URL
}

export async function sendInviteEmail(params: {
  email: string
  productName: string
  inviterName: string
  role: string
  token: string
}): Promise<boolean> {
  const acceptUrl = `${APP_URL}/register?invite=${params.token}`
  const { subject, html } = inviteTemplate({
    productName: params.productName,
    inviterName: params.inviterName,
    role: params.role,
    acceptUrl,
  })
  return send(params.email, subject, html)
}

export async function sendPasswordResetEmail(params: {
  email: string
  userName: string
  token: string
}): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${params.token}`
  const { subject, html } = passwordResetTemplate({
    userName: params.userName,
    resetUrl,
  })
  return send(params.email, subject, html)
}

export async function sendWelcomeEmail(params: {
  email: string
  userName: string
}): Promise<boolean> {
  const { subject, html } = welcomeTemplate({
    userName: params.userName,
    loginUrl: `${APP_URL}/login`,
  })
  return send(params.email, subject, html)
}

export async function sendNotificationEmail(params: {
  email: string
  userName: string
  eventType: 'assigned' | 'status_change' | 'comment' | 'deadline'
  entityType: string
  entityTitle: string
  entityUrl: string
  actorName: string
  details?: string
}): Promise<boolean> {
  const { email, ...rest } = params
  const { subject, html } = notificationTemplate(rest)
  return send(email, subject, html)
}
