# Phase 2 — Encryption Layer

> **Objective:** Implement the 3-tier key hierarchy (MK → UEK → FEK) and all AES-256-GCM encrypt/decrypt utilities.

**Depends on:** Phase 0  
**Blueprint ref:** Section 2 (Encryption Architecture), Section 11 (RCE Protection)

---

## Tasks

- [ ] **2.1 — Implement AES-256-GCM encrypt/decrypt**
  - File: `src/lib/crypto/aes.ts`
  - `encrypt(data: Buffer, key: Buffer): Buffer` — returns `iv + authTag + ciphertext`
  - `decrypt(payload: Buffer, key: Buffer): Buffer` — splits iv/authTag/ciphertext, decrypts
  - IV: 12 bytes random, authTag: 16 bytes

- [ ] **2.2 — Implement key management utilities**
  - File: `src/lib/crypto/keys.ts`
  - `getMasterKey(): Buffer` — reads `MASTER_ENCRYPTION_KEY` from env, converts hex → Buffer
  - `generateUEK(): Buffer` — `crypto.randomBytes(32)`
  - `encryptUEK(uek: Buffer): Buffer` — encrypts UEK with MK using `encrypt()`
  - `decryptUEK(encryptedUek: Buffer): Buffer` — decrypts with MK
  - `generateFEK(): Buffer` — `crypto.randomBytes(32)`
  - `encryptFEK(fek: Buffer, uek: Buffer): Buffer`
  - `decryptFEK(encryptedFek: Buffer, uek: Buffer): Buffer`

- [ ] **2.3 — Implement constant-time comparison**
  - File: `src/lib/crypto/timing.ts`
  - `safeCompare(a: string, b: string): boolean` — uses `crypto.timingSafeEqual`
  - Handle different-length strings (return false without timing leak)

- [ ] **2.4 — Implement filename sanitization**
  - File: `src/lib/crypto/sanitize.ts`
  - `sanitizeFilename(name: string): string` per Section 11 RCE checklist
  - Strip `/\:*?"<>|`, `..`, leading `.`, limit 255 chars

- [ ] **2.5 — Implement streaming cipher factory**
  - File: `src/lib/crypto/stream.ts`
  - `createEncryptStream(key: Buffer): { stream: TransformStream, getIV: () => Buffer, getAuthTag: () => Buffer }`
  - Creates an AES-256-GCM cipher as a Web API `TransformStream` for piping `req.body` directly through encryption
  - Generates a fresh 12-byte IV internally
  - `getAuthTag()` only available after stream is fully consumed (after `cipher.final()`)
  - `createDecryptStream(key: Buffer, iv: Buffer, authTag: Buffer): TransformStream` — for download streaming (Phase 5)
  - Used by the streaming chunk upload route (Phase 4, task 4.3)

- [ ] **2.6 — Create barrel export**
  - File: `src/lib/crypto/index.ts`
  - Export all crypto functions including streaming helpers

---

## Deliverables

| Output                      | Location                     |
| --------------------------- | ---------------------------- |
| AES-256-GCM utilities       | `src/lib/crypto/aes.ts`      |
| Key management (MK/UEK/FEK) | `src/lib/crypto/keys.ts`     |
| Timing-safe comparison      | `src/lib/crypto/timing.ts`   |
| Filename sanitizer          | `src/lib/crypto/sanitize.ts` |
| Streaming cipher factory    | `src/lib/crypto/stream.ts`   |

---

## Testing

### Automated (Vitest) — `tests/crypto/`

```bash
npx vitest run tests/crypto
```

| Test File          | Test Case                                           | Expected                     |
| ------------------ | --------------------------------------------------- | ---------------------------- |
| `aes.test.ts`      | Encrypt → decrypt round-trip                        | Returns exact original bytes |
| `aes.test.ts`      | Decrypt with wrong key                              | Throws error                 |
| `aes.test.ts`      | Tampered ciphertext                                 | Throws authentication error  |
| `aes.test.ts`      | Empty data encrypt/decrypt                          | Works correctly              |
| `keys.test.ts`     | UEK encrypt → decrypt with MK                       | Returns original UEK         |
| `keys.test.ts`     | FEK encrypt → decrypt with UEK                      | Returns original FEK         |
| `keys.test.ts`     | FEK decrypt with wrong UEK                          | Throws error                 |
| `keys.test.ts`     | `getMasterKey()` without env var                    | Throws clear error           |
| `timing.test.ts`   | Equal strings → true                                | Returns true                 |
| `timing.test.ts`   | Different strings → false                           | Returns false                |
| `timing.test.ts`   | Different-length strings → false                    | Returns false without crash  |
| `sanitize.test.ts` | Strips `../` and dangerous chars                    | Returns sanitized name       |
| `sanitize.test.ts` | Truncates to 255 chars                              | Output ≤ 255 chars           |
| `sanitize.test.ts` | Hidden file prefix removed                          | Leading `.` replaced         |
| `stream.test.ts`   | Encrypt stream → collect → decrypt matches original | Round-trip integrity         |
| `stream.test.ts`   | Auth tag available after stream consumed            | Non-null 16-byte Buffer      |
| `stream.test.ts`   | Decrypt stream with wrong key                       | Throws error                 |

Write all test files in `tests/crypto/*.test.ts`.
