import { sendEmail } from '@pantolingo/smtp'
import { pool } from '@pantolingo/db/pool'
import type { EmailConfig } from 'next-auth/providers'
import { generateVerificationCode } from './auth-code'

/**
 * Custom email provider using @pantolingo/smtp
 * Sends magic link emails for passwordless authentication
 */
export function SmtpProvider(): EmailConfig {
	return {
		id: 'smtp',
		type: 'email',
		name: 'Email',
		maxAge: 10 * 60, // Magic link expires in 10 minutes
		async sendVerificationRequest({ identifier, url }) {
			const emailFrom = process.env.SMTP_FROM
			if (!emailFrom) {
				throw new Error('SMTP_FROM environment variable is required for magic link authentication')
			}

			// Simplify URL to just include token (email looked up server-side)
			// From: /api/auth/callback/smtp?callbackUrl=https://domain.com/dashboard&token=xxx
			// To:   /login/magic?token=xxx
			const parsed = new URL(url)
			const token = parsed.searchParams.get('token')
			const magicLinkUrl = `${parsed.origin}/login/magic?token=${token}`

			// Generate and store verification code (UPSERT handles race with adapter)
			const code = generateVerificationCode()
			await pool.query(
				`INSERT INTO auth_token (identifier, token, expires_at, code)
				 VALUES ($1, $2, NOW() + INTERVAL '10 minutes', $3)
				 ON CONFLICT (identifier, token) DO UPDATE SET code = $3`,
				[identifier, token, code]
			)

			const result = await sendEmail({
				from: emailFrom,
				to: identifier,
				subject: 'Your login code for PantoLingo',
				text: `Your login code is: ${code}\n\nOr click to sign in to Pantolingo:\n\n${magicLinkUrl}\n\nThis link and code will only be valid for the next 10 minutes.`,
				html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #f5f5f5;">
  <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <h1 style="margin: 0 0 24px; font-size: 24px; color: #333;">Your login code for PantoLingo</h1>
    <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
      Click the button below to sign in to your account, or enter the code manually.
    </p>
    <a href="${magicLinkUrl}" style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
      Login to PantoLingo
    </a>
    <div style="margin: 24px 0; padding: 20px; background: #f8f9fa; border-radius: 6px; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #666;">Or enter this code:</p>
      <p style="margin: 0; font-size: 28px; font-family: monospace; font-weight: bold; letter-spacing: 2px; color: #333;">
        ${code}
      </p>
    </div>
    <p style="margin: 0; font-size: 14px; color: #999;">
      This link and code will only be valid for the next 10 minutes. If you didn't request this email, you can safely ignore it.
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
