# Security Standards & Guides

> Reference materials for implementing SecureVault's security features.

## Encryption Standards

| Standard                          | Relevance                         | Link                                                                           |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| **AES-256-GCM** (NIST SP 800-38D) | File and key encryption algorithm | [NIST Publication](https://csrc.nist.gov/publications/detail/sp/800-38d/final) |
| **Argon2id** (RFC 9106)           | Password hashing algorithm        | [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106)                             |
| **TOTP** (RFC 6238)               | Time-based OTP for 2FA (stretch)  | [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238)                             |

## Web Security Standards

| Standard                                     | Relevance                      | Link                                                                                                 |
| -------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **OWASP Top 10 (2021)**                      | Web application security risks | [OWASP](https://owasp.org/Top10/)                                                                    |
| **OWASP Cheat Sheet: Cryptographic Storage** | Key management best practices  | [Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html) |
| **OWASP Cheat Sheet: Session Management**    | Session token security         | [Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)    |
| **OWASP Cheat Sheet: Password Storage**      | Hashing and salting passwords  | [Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)      |
| **Content Security Policy (CSP)**            | XSS prevention via headers     | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)                                         |
| **Cookie Security**                          | httpOnly, Secure, SameSite     | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)                                     |

## Security Testing Tools

| Tool                    | Purpose                     | Link                                               |
| ----------------------- | --------------------------- | -------------------------------------------------- |
| **SecurityHeaders.com** | Scan HTTP security headers  | [securityheaders.com](https://securityheaders.com) |
| **Qualys SSL Labs**     | Test TLS configuration      | [ssllabs.com](https://www.ssllabs.com/ssltest/)    |
| **OWASP ZAP**           | Automated security scanning | [zaproxy.org](https://www.zaproxy.org/)            |

## Compliance References

| Framework         | Relevance                                                           |
| ----------------- | ------------------------------------------------------------------- |
| **GDPR**          | If handling EU user data — data encryption at rest helps compliance |
| **SOC 2 Type II** | Encryption, access control, audit logs align with SOC 2 principles  |

## Key Security Principles Applied

1. **Defense in Depth** — Encryption at rest + in transit + key hierarchy + access control
2. **Principle of Least Privilege** — Scoped services, per-user queries
3. **Fail Secure** — Return 404 for both "not found" and "forbidden"
4. **No Security Through Obscurity** — Known algorithms (AES-256-GCM, Argon2id)
5. **Timing-Safe Comparisons** — All token/hash checks use `crypto.timingSafeEqual`
