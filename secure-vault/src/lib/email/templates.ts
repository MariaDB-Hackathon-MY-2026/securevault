export function otpEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 20px; background-color: #f4f4f5; text-align: center; border-radius: 8px; margin: 20px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .footer { font-size: 12px; color: #666; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eaeaea; }
  </style>
</head>
<body>
  <div class="container">
    <h2>SecureVault Access Code</h2>
    <p>You requested a secure link access code. Please use the following code to continue:</p>
    <div class="otp-code">${code}</div>
    <p><strong>This code expires in 5 minutes.</strong></p>
    <div class="footer">
      If you did not request this code, you can safely ignore this email.
    </div>
  </div>
</body>
</html>
  `;
}

export function passwordResetOtpEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 20px; background-color: #f4f4f5; text-align: center; border-radius: 8px; margin: 20px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .footer { font-size: 12px; color: #666; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eaeaea; }
  </style>
</head>
<body>
  <div class="container">
    <h2>SecureVault Password Reset Code</h2>
    <p>You requested to reset your SecureVault password. Use the following verification code to continue:</p>
    <div class="otp-code">${code}</div>
    <p><strong>This code expires in 5 minutes.</strong></p>
    <div class="footer">
      If you did not request a password reset, you can safely ignore this email.
    </div>
  </div>
</body>
</html>
  `;
}
