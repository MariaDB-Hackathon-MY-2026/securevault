# Password Reset E2E Notes

These scenarios are intended for reviewer-side execution only. The implementation was not validated with a full Playwright run in this workspace.

## Setup

- Start the app with MariaDB and Redis available.
- Use a fresh test account or sign up a new one.
- In local or test environments, read password reset OTPs from the server terminal output.

## Scenarios

1. Sign up a new account and confirm it is treated as verified immediately after login.
2. Request a password reset from `/forgot-password` and confirm the UI shows the generic success message.
3. Read the logged OTP from the server terminal and submit an incorrect code once from `/reset-password`; confirm the inline invalid-code error.
4. Request a resend, capture the new OTP, and confirm the older OTP no longer works.
5. Submit the new OTP with a strong password and confirm the success message instructs the user to log in again.
6. Verify any previously active session is invalidated after the reset succeeds.
7. Request another reset and intentionally fail the same OTP three times; confirm the UI surfaces the locked-code guidance and resend remains available.

## Assertions

- Request responses stay generic for both existing and unknown emails.
- The resend action reuses the same request endpoint.
- A successful reset rotates the password and invalidates all sessions.
- Expired, used, and locked codes produce stable backend error codes so the UI can guide the user correctly.
