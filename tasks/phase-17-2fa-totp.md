# Phase 17 — 2FA / TOTP _(Stretch Goal)_

> **Objective:** Add optional TOTP-based two-factor authentication.

**Depends on:** Phase 3 (Auth)  
**Blueprint ref:** Section 14 (2FA / TOTP)

> [!NOTE]
> **Not in MVP scope.** Only implement if time permits.

---

## Tasks

- [ ] **17.1 — Implement TOTP service**
  - `npm install otpauth qrcode`
  - Generate TOTP secret, QR code, backup codes
  - Verify 6-digit code (30s window, 1 drift)

- [ ] **17.2 — Build 2FA setup UI** (in settings)
  - Show QR code + backup codes
  - Confirm with a valid TOTP code before enabling

- [ ] **17.3 — Integrate 2FA into login flow**
  - After password validation, if 2FA enabled → prompt for TOTP code
  - Support backup codes as fallback

---

## Testing

| Test                                      | Expected          |
| ----------------------------------------- | ----------------- |
| Enable 2FA → QR code shown                | Setup works       |
| Login with correct TOTP → session created | Auth works        |
| Login with wrong TOTP → rejected          | Security enforced |
| Login with backup code → works (one-time) | Fallback works    |
