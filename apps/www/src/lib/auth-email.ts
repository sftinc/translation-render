import { sendEmail } from '@pantolingo/smtp'
import type { EmailConfig } from 'next-auth/providers'

/**
 * Custom email provider using @pantolingo/smtp
 * Sends magic link emails for passwordless authentication
 */
export function SmtpProvider(): EmailConfig {
	return {
		id: 'smtp',
		type: 'email',
		name: 'Email',
		maxAge: 60 * 60, // Magic link expires in 1 hour
		async sendVerificationRequest({ identifier, url }) {
			const emailFrom = process.env.EMAIL_FROM
			if (!emailFrom) {
				throw new Error('EMAIL_FROM environment variable is required for magic link authentication')
			}

			const result = await sendEmail({
				from: emailFrom,
				to: identifier,
				subject: 'Sign in to Pantolingo',
				text: `Click to sign in to Pantolingo:\n\n${url}\n\nThis link expires in 1 hour.`,
				html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #f5f5f5;">
  <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <h1 style="margin: 0 0 24px; font-size: 24px; color: #333;">Sign in to Pantolingo</h1>
    <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
      Click the button below to sign in to your account.
    </p>
    <a href="${url}" style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
      Sign in
    </a>
    <p style="margin: 24px 0 0; font-size: 14px; color: #999;">
      This link expires in 1 hour. If you didn't request this email, you can safely ignore it.
    </p>
  </div>
</body>
</html>
				`.trim(),
			})

			if (!result.success) {
				throw new Error(`Failed to send magic link email: ${result.error}`)
			}
		},
	}
}
