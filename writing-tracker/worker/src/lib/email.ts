export interface Env {
  RESEND_API_KEY: string
  FROM_EMAIL: string
}

export async function sendPasswordResetEmail(
  env: Env,
  to: string,
  resetUrl: string
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [to],
      subject: 'Reset your Writing Tracker password',
      html: `
        <p>You requested a password reset for your Writing Tracker account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p style="color:#999;font-size:12px">${resetUrl}</p>
      `,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to send email: ${res.status} ${body}`)
  }
}
