# SecureVault — Architecture Blueprint

> Encrypted file storage web app with secure link sharing, AI-powered file management, and fine-grained access control.

---

## 1. System Overview

```mermaid
graph TB
    subgraph Client["Browser (Client)"]
        UI["Next.js App (shadcn UI)"]
        TQ["TanStack Query"]
        Chunker["File Chunker (5MB chunks)"]
    end

    subgraph Vercel["Vercel (Next.js App Router)"]
        SA["Server Actions"]
        RH["Route Handlers"]
        MW["Middleware (Auth)"]
        AI["AI Agent (Vercel AI SDK)"]
    end

    subgraph Storage["Storage Layer"]
        MDB["MariaDB (Metadata, Keys, Auth)"]
        R2["Cloudflare R2 (Encrypted Files)"]
    end

    UI --> TQ --> SA
    UI --> Chunker --> RH
    SA --> MDB
    RH --> R2
    AI --> MDB
    MW --> MDB
```

### Tech Stack

| Layer            | Technology                                                   | Purpose                          |
| ---------------- | ------------------------------------------------------------ | -------------------------------- |
| **Frontend**     | Next.js 15 App Router, TypeScript, shadcn/ui, TanStack Query | UI, state, data fetching         |
| **Backend**      | Next.js Server Actions + Route Handlers                      | Business logic, encryption       |
| **Database**     | MariaDB + Drizzle ORM                                        | Metadata, keys, auth, sharing    |
| **File Storage** | Cloudflare R2                                                | Encrypted file blobs             |
| **AI**           | Vercel AI SDK                                                | File search, summarization agent |
| **Auth**         | Custom session-based                                         | Multi-device, refresh tokens     |
| **Crypto**       | Node.js `crypto` (AES-256-GCM)                               | File and key encryption          |

---

## 2. Encryption Architecture

### Key Hierarchy (3-Tier)

```mermaid
graph TD
    MK["🔑 Master Key - MK<br/>Environment variable<br/>AES-256 key"]
    --> UEK["🔑 User Encryption Key - UEK<br/>Random per user<br/>Encrypted with MK"]
    --> FEK["🔑 File Encryption Key - FEK<br/>Random per file<br/>Encrypted with UEK"]
    --> FILE["📄 File Data<br/>Encrypted with FEK<br/>AES-256-GCM"]
```

| Key                           | Generation                          | Storage                                            | Rotation                             |
| ----------------------------- | ----------------------------------- | -------------------------------------------------- | ------------------------------------ |
| **Master Key (MK)**           | Generated once, stored in env       | `MASTER_ENCRYPTION_KEY` env var                    | Manual rotation re-encrypts all UEKs |
| **User Encryption Key (UEK)** | `crypto.randomBytes(32)` on signup  | MariaDB `users.encrypted_uek` (encrypted with MK)  | On MK rotation                       |
| **File Encryption Key (FEK)** | `crypto.randomBytes(32)` per upload | MariaDB `files.encrypted_fek` (encrypted with UEK) | Never (immutable per file)           |

### Why This Design?

- **MK protects UEKs at rest** — if DB is leaked, UEKs are useless without the MK
- **UEK protects FEKs** — each user has isolated encryption; compromising one user doesn't affect others
- **FEK per file** — deleting a file's FEK makes its data irrecoverable, even if the blob remains in R2
- **No password derivation** — simpler UX, no re-encryption on password change

### Encryption Flow (AES-256-GCM)

```typescript
// Encrypt
const iv = crypto.randomBytes(12); // 96-bit IV for GCM
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
const authTag = cipher.getAuthTag(); // 16 bytes
// Store: iv + authTag + encrypted

// Decrypt
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
```

---

## 3. File Upload Flow (Chunked + Streamed)

> [!IMPORTANT]
> Vercel has a **4.5MB body limit** on serverless functions. Files are split into 5MB chunks on the client and uploaded individually through a Route Handler. **Each chunk is streamed through the server** — never fully buffered in memory.

```mermaid
sequenceDiagram
    actor User
    participant Client as Browser
    participant RH as Route Handler
    participant DB as MariaDB
    participant R2 as Cloudflare R2

    User->>Client: Select file (up to 100MB)
    Client->>Client: Split into 5MB chunks
    Client->>RH: POST /api/upload/init
    RH->>DB: Create file record (status: uploading)
    RH->>RH: Generate FEK, encrypt with UEK
    RH-->>Client: uploadId, fileId, totalChunks

    loop Each chunk (streamed)
        Client->>RH: POST /api/upload/chunk (stream body)
        RH->>RH: Pipe stream through AES-256-GCM cipher
        RH->>R2: Stream encrypted data directly to R2 PUT
        RH->>DB: Store IV + auth tag in file_chunks
        RH-->>Client: chunk completed
    end

    Client->>RH: POST /api/upload/complete
    RH->>DB: Update file status to ready
    RH-->>Client: fileId, status ready
```

### Key Design Decisions

- **Why 5MB chunks?** Fits within Vercel's body limit with headroom. Large enough to minimize round trips.
- **Streaming through the server** — the request body is piped through a `crypto.createCipheriv` Transform stream directly to R2's `PutObjectCommand`. The server never holds the full chunk in memory (~64KB stream buffer vs ~10MB buffered). This is critical for handling concurrent uploads without memory pressure on Vercel serverless functions.
- **Each chunk encrypted independently** with its own IV — enables parallel decryption and random-access streaming.
- **Auth tag stored in DB** — AES-256-GCM's auth tag is only available after `cipher.final()`, so it's stored in `file_chunks` alongside the IV, separate from the R2 blob.
- **R2 folder structure** — per-user organization:
  ```
  /{userId}/files/{fileId}/chunk_0
  /{userId}/files/{fileId}/chunk_1
  /{userId}/thumbnails/{fileId}.webp
  ```
- **Upload resumability** — if upload fails mid-way, client can retry from the last successful chunk.
- **Quota check** — server checks `user.storage_used + file.size <= 1GB` before accepting upload.
- **Max file size**: 100MB per file.
- **Dynamic chunk concurrency**: Client uses a **global chunk queue** (e.g., `p-queue` with `concurrency: 3`) to limit active network requests across _all_ files. Whether uploading 1 large file or 50 small files, only 3 chunk uploads run simultaneously. This maximizes upload speed for single files while preventing self-DDoS from multi-file drops.
- **Body parser disabled**: Route Handlers for chunk upload must disable Next.js body parsing to enable raw streaming: `export const runtime = 'nodejs';` and access `req.body` as a `ReadableStream` directly.

### Streaming Upload Implementation

```typescript
// app/api/upload/chunk/route.ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import crypto from "crypto";

export async function POST(req: Request) {
  // 1. Auth + validate chunk metadata from headers
  const userId = await requireAuth(req);
  const uploadId = req.headers.get("x-upload-id")!;
  const chunkIndex = parseInt(req.headers.get("x-chunk-index")!);

  // 2. Get decrypted FEK for this upload
  const fek = await getDecryptedFEK(uploadId, userId);

  // 3. Create AES-256-GCM cipher (streaming mode)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", fek, iv);

  // 4. Stream: Request Body → Cipher Transform → R2 PUT
  //    Only ~64KB buffered at any time (vs ~10MB if fully buffered)
  const encryptedStream = new ReadableStream({
    async start(controller) {
      const reader = req.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(cipher.final());
          controller.close();
          break;
        }
        controller.enqueue(cipher.update(value));
      }
    },
  });

  // 5. Upload encrypted stream directly to R2
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `${userId}/files/${fileId}/chunk_${chunkIndex}`,
      Body: Readable.fromWeb(encryptedStream),
    }),
  );

  // 6. Store IV + auth tag in DB (available after cipher.final())
  const authTag = cipher.getAuthTag();
  await db.insert(fileChunks).values({
    id: nanoid(),
    fileId,
    chunkIndex,
    r2Key: `${userId}/files/${fileId}/chunk_${chunkIndex}`,
    iv,
    authTag,
  });

  return Response.json({ chunkIndex, status: "uploaded" });
}
```

### Memory Comparison

| Metric                   | Buffer (Old)              | Stream (Current)      |
| ------------------------ | ------------------------- | --------------------- |
| RAM per request          | ~10MB (raw + encrypted)   | ~64KB (stream buffer) |
| 10 concurrent uploads    | ~100MB                    | ~640KB                |
| Time to first byte to R2 | After full chunk received | Immediate             |
| Vercel serverless fit    | Risky under load          | Safe                  |

---

## 4. File Download Flow (Streaming)

```mermaid
sequenceDiagram
    actor User
    participant Client as Browser
    participant RH as Route Handler
    participant DB as MariaDB
    participant R2 as Cloudflare R2

    User->>Client: Click download or preview
    Client->>RH: GET /api/files/id/download
    RH->>DB: Verify auth + get encrypted FEK
    RH->>RH: Decrypt FEK with UEK

    loop Stream each chunk
        RH->>R2: GET chunk from R2
        RH->>RH: Decrypt chunk with FEK
        RH-->>Client: Stream decrypted chunk
    end
```

- Uses `ReadableStream` in Route Handler for memory-efficient streaming
- Sets `Content-Type` and `Content-Disposition` headers for browser preview vs download
- **`Content-Length` header**: Compute from `files.size` (original file size) so browsers can show download progress bars. Note: encrypted chunk sizes differ from original (GCM adds 28 bytes per chunk), but `files.size` stores the original unencrypted size which is what the decrypted response will be.

---

## 5. Authentication System

### Session-Based, Multi-Device

```mermaid
graph LR
    subgraph Login
        PW["Password Argon2id hash"] --> Session["Create Session"]
    end

    subgraph Sessions["Multi-Device Sessions"]
        Session --> S1["📱 Device 1"]
        Session --> S2["💻 Device 2"]
        Session --> S3["🖥️ Device 3"]
    end
```

| Token             | Format            | Storage                       | Lifetime | Purpose                      |
| ----------------- | ----------------- | ----------------------------- | -------- | ---------------------------- |
| **Session token** | nanoid(32) opaque | `__Secure-session` (httpOnly) | 15 min   | Authenticate API requests    |
| **Refresh token** | nanoid(32) opaque | `__Secure-refresh` (httpOnly) | 30 days  | Silently renew session token |

> [!NOTE]
> **Why nanoid over JWT?** Every request already hits MariaDB (to get encrypted UEK for file operations), so a DB lookup per request adds no overhead. nanoid gives us instant revocation (critical for "revoke device"), simpler implementation, and shorter cookie values. JWT's statelessness benefit doesn't apply here.

### Cookie Configuration

Use **secure httpOnly cookies** prefixed with `__Secure-`:

```typescript
cookies().set("__Secure-session", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge: 15 * 60, // 15 min
});
```

### Auth Flow

1. **Signup**: Hash password with Argon2id → generate UEK → encrypt UEK with MK → store
2. **Login**: Verify Argon2id hash → create session + refresh token pair → set cookies → record device info
3. **Request**: Middleware checks session cookie → if expired, auto-refresh using refresh token
4. **Logout**: Delete session from DB → clear cookies (only that device)
5. **Revoke device**: Delete specific refresh token → that device is logged out

---

## 6. Link Sharing and Access Control

### Share Link Structure

```
https://securevault.app/s/{linkToken}
linkToken: nanoid(32) — cryptographically random, URL-safe
```

### Access Flow

```mermaid
flowchart TD
    A["User opens share link"] --> B{"Link exists and not revoked?"}
    B -- No --> X["404 Not Found"]
    B -- Yes --> C{"Link expired?"}
    C -- Yes --> X2["Link Expired"]
    C -- No --> D{"Has email allowlist?"}
    D -- No --> G["Serve file - public link"]
    D -- Yes --> E["Prompt for email"]
    E --> F{"Email in allowlist?"}
    F -- No --> X3["Access Denied"]
    F -- Yes --> OTP["Send 6-digit OTP"]
    OTP --> V{"OTP valid?"}
    V -- No --> X4["Invalid OTP"]
    V -- Yes --> G
```

### Link Features

| Feature              | Implementation                                               |
| -------------------- | ------------------------------------------------------------ |
| **Expiry**           | `expires_at` timestamp in DB, checked on each access         |
| **Email allowlist**  | `share_link_emails` junction table                           |
| **OTP verification** | 6-digit code, stored hashed in DB, 5 min TTL, max 3 attempts |
| **Revocation**       | Owner sets `revoked_at` timestamp → instant invalidation     |
| **Download limit**   | Optional `max_downloads` counter                             |
| **Access log**       | Record each access with IP, timestamp, email (if verified)   |

### OTP Delivery

For the hackathon, use **Resend** (free tier: 100 emails/day) or **nodemailer** with a Gmail SMTP for sending OTP emails.

---

## 7. AI Agent (Vercel AI SDK) — ⏳ OPTIONAL STRETCH GOAL

> [!NOTE]
> **Not in MVP scope.** Implement only after core file storage, sharing, and auth are stable. This section is kept as a reference for post-MVP enhancement.

### Capabilities

| Feature                | How It Works                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **File search**        | User asks "find my tax documents" → agent queries MariaDB full-text search on filenames + metadata |
| **File summarization** | Agent fetches file content (text/PDF), sends to LLM for summary                                    |
| **Smart sharing**      | "Share the Q1 report with the marketing team" → agent identifies file + creates share link         |

### Architecture

```typescript
// app/api/chat/route.ts
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `You are SecureVault's file assistant. You help users find, 
             organize, and share their files. Use the provided tools.`,
    messages,
    tools: {
      searchFiles: {
        /* query MariaDB */
      },
      getFileInfo: {
        /* file metadata */
      },
      summarizeFile: {
        /* decrypt + send to LLM */
      },
      createShareLink: {
        /* generate share link */
      },
    },
  });

  return result.toDataStreamResponse();
}
```

---

## 8. Database Schema (MariaDB + Drizzle)

```mermaid
erDiagram
    users ||--o{ sessions : has
    users ||--o{ files : owns
    users ||--o{ folders : owns
    files ||--o{ share_links : has
    share_links ||--o{ share_link_emails : allows
    share_links ||--o{ share_link_access_logs : logs
    share_links ||--o{ share_link_otps : verifies
    folders ||--o{ files : contains
    files ||--o{ file_chunks : has

    users {
        varchar id PK
        varchar email UK
        varchar name
        text password_hash
        blob encrypted_uek
        bigint storage_used
        bigint storage_quota "default 1GB"
        timestamp created_at
        timestamp updated_at
    }

    sessions {
        varchar id PK
        varchar user_id FK
        varchar session_token_hash
        varchar refresh_token_hash
        varchar device_name
        varchar ip_address
        timestamp expires_at
        timestamp created_at
    }

    folders {
        varchar id PK
        varchar user_id FK
        varchar parent_id FK
        varchar name
        timestamp deleted_at "nullable"
        timestamp created_at
    }

    files {
        varchar id PK
        varchar user_id FK
        varchar folder_id FK
        varchar name
        varchar mime_type
        bigint size
        int total_chunks
        blob encrypted_fek
        enum status
        timestamp created_at
        timestamp updated_at
    }

    file_chunks {
        varchar id PK
        varchar file_id FK
        int chunk_index
        varchar r2_key
        blob iv
        blob auth_tag
    }

    share_links {
        varchar id PK
        varchar file_id FK
        varchar created_by FK
        varchar token UK
        timestamp expires_at
        int max_downloads
        int download_count
        boolean is_public
        timestamp revoked_at
        timestamp created_at
    }

    share_link_emails {
        varchar id PK
        varchar share_link_id FK
        varchar email
    }

    share_link_otps {
        varchar id PK
        varchar share_link_id FK
        varchar email
        varchar otp_hash
        int attempts
        timestamp expires_at
        timestamp created_at
    }

    share_link_access_logs {
        varchar id PK
        varchar share_link_id FK
        varchar email
        varchar ip_address
        timestamp accessed_at
    }

    password_reset_tokens {
        varchar id PK
        varchar user_id FK
        varchar token_hash
        timestamp expires_at
        timestamp used_at
        timestamp created_at
    }

    email_verification_tokens {
        varchar id PK
        varchar user_id FK
        varchar token_hash
        timestamp expires_at
        timestamp used_at
        timestamp created_at
    }
```

---

## 9. Project Structure

```
securevault/
├── src/
│   ├── app/
│   │   ├── (auth)/login, signup
│   │   ├── (dashboard)/files, shared, settings, chat
│   │   ├── s/[token]/page.tsx         — public share link viewer
│   │   └── api/upload, files, share, chat
│   ├── lib/
│   │   ├── crypto/                    — AES-256-GCM, key mgmt, OTP
│   │   ├── auth/                      — sessions, middleware, Argon2id
│   │   ├── storage/                   — R2 client, chunked upload
│   │   ├── db/                        — Drizzle schema, migrations
│   │   ├── ai/                        — tools, prompts
│   │   └── email/                     — OTP sender
│   ├── components/
│   │   ├── ui/                        — shadcn components
│   │   ├── file-explorer/             — file grid/list view
│   │   ├── upload/                    — upload dialog + progress
│   │   ├── share/                     — share link management
│   │   └── chat/                      — AI chat interface
│   ├── hooks/                         — use-upload, use-files
│   └── middleware.ts                  — auth guard
├── drizzle.config.ts
├── next.config.ts
└── .env.local
```

---

## 10. Deployment Strategy

### Environment Variables

```env
DATABASE_URL=mysql://user:pass@host.railway.app:3306/securevault
MASTER_ENCRYPTION_KEY=<64-char hex string>
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=securevault-files
OPENAI_API_KEY=...
RESEND_API_KEY=...
NEXT_PUBLIC_APP_URL=https://securevault.app
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### R2 Bucket Lockdown

> [!CAUTION]
> The R2 bucket **must be private** (no public access). Even though blobs are encrypted, public access would expose encrypted data and bucket structure. Verify:
>
> - No public access policy on the bucket
> - No custom domain mappings exposing the bucket
> - Access only via the S3-compatible API using `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
> - Set bucket CORS policy to allow requests only from `NEXT_PUBLIC_APP_URL`

> [!WARNING]
> On Vercel Hobby plan, function timeout is 10 seconds. For 1GB file operations, you will need **Vercel Pro** (60s timeout) or self-host. Consider capping file size at **100MB** for the hackathon demo.

### CORS Configuration

The share link viewer page (`/s/[token]`) serves content from the same origin, so CORS is not needed for MVP. However, if embedding previews cross-origin in the future, add CORS headers to the file preview Route Handler.

---

## 11. Security Threat Model

| Threat                            | Mitigation                                                                  |
| --------------------------------- | --------------------------------------------------------------------------- |
| **R2 bucket leak**                | Files encrypted at rest with per-file FEKs                                  |
| **DB leak**                       | UEKs encrypted with MK (env var), FEKs encrypted with UEKs                  |
| **MK compromise**                 | Rotate MK → re-encrypt all UEKs (batch job)                                 |
| **Session hijacking**             | httpOnly + Secure + SameSite=Strict cookies (`__Secure-` prefixed)          |
| **Brute-force login**             | Rate limiting + Argon2id cost                                               |
| **OTP brute-force**               | Max 3 attempts, 5 min expiry, hashed storage                                |
| **Link enumeration**              | 32-char nanoid = 10^57 possibilities                                        |
| **XSS on preview**                | Content-Security-Policy, sanitize filenames                                 |
| **CSRF**                          | Server Actions have built-in CSRF protection                                |
| **RCE via filename**              | Sanitize all filenames, strip path separators, reject `../`                 |
| **RCE via file processing**       | sharp/ffmpeg run on trusted buffers only, never shell-exec with user input  |
| **RCE via content-type**          | Server-side MIME sniffing (`file-type` lib), ignore client-provided MIME    |
| **Malicious file preview**        | `X-Content-Type-Options: nosniff`, serve previews in sandboxed iframe       |
| **Path traversal**                | R2 keys constructed from validated IDs only, never user-provided paths      |
| **Zip bomb / decompression bomb** | No server-side extraction, files stored as-is                               |
| **Timing attacks**                | `crypto.timingSafeEqual()` for ALL token/hash comparisons                   |
| **Weak passwords**                | Enforce min 8 chars + complexity, or `zxcvbn` strength scoring              |
| **Open redirect after login**     | Validate redirect URL is relative and starts with `/`, reject absolute URLs |
| **Account enumeration (login)**   | Same error "Invalid email or password" for both missing email and wrong pw  |
| **Account enumeration (reset)**   | Always say "If an account exists, we sent a reset link" regardless          |

### Additional Security Hardening

```typescript
// 1. Constant-time comparison — MUST USE for all security comparisons
import { timingSafeEqual } from "crypto";
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// 2. Secure httpOnly cookies
cookies().set("__Secure-session", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge: 15 * 60, // 15 min
});

// 3. Password strength validation
import { zxcvbn } from "@zxcvbn-ts/core";
const result = zxcvbn(password);
if (result.score < 3) throw new Error("Password too weak");

// 4. Open redirect prevention
function safeRedirect(url: string): string {
  if (!url.startsWith("/") || url.startsWith("//")) return "/dashboard";
  return url;
}
```

### Performance Optimizations

| Area                         | Problem                                         | Solution                                                                             |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| **DB connection pooling**    | Each serverless invocation opens new connection | `mysql2` pool with `connectionLimit: 10`, module-level singleton                     |
| **Drizzle client singleton** | Cold start recreates ORM instance               | `globalThis` caching pattern                                                         |
| **Database indexes**         | Slow queries as data grows                      | Index on `files.user_id`, `files.folder_id`, `share_links.token`, `sessions.user_id` |
| **Parallel chunk download**  | Sequential decrypt is slow for large files      | Pipeline: download chunk N+1 while decrypting chunk N                                |
| **Thumbnail caching**        | Re-decrypted on every page load                 | `Cache-Control: private, max-age=3600` on thumbnail responses                        |
| **Query optimization**       | N+1 queries listing files with metadata         | Use Drizzle `with` relations for eager loading                                       |

```typescript
// DB singleton pattern for serverless
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const globalForDb = globalThis as { db?: ReturnType<typeof drizzle> };

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 10,
  waitForConnections: true,
});

export const db = globalForDb.db ?? drizzle(pool);
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
```

```sql
-- Required indexes
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);
CREATE INDEX idx_files_user_folder ON files(user_id, folder_id, deleted_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_file_id ON share_links(file_id);
CREATE INDEX idx_file_chunks_file_id ON file_chunks(file_id, chunk_index);
CREATE INDEX idx_access_logs_link_id ON share_link_access_logs(share_link_id);
```

### RCE Protection Checklist

```typescript
// 1. Filename sanitization — applied on every upload
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "_") // Strip dangerous chars
    .replace(/\.\./g, "_") // No path traversal
    .replace(/^\./, "_") // No hidden files
    .slice(0, 255); // Length limit
}

// 2. MIME type validation — never trust the client
import { fileTypeFromBuffer } from "file-type";
const detected = await fileTypeFromBuffer(chunk);
const safeMime = detected?.mime ?? "application/octet-stream";

// 3. Security headers — in next.config.ts
headers: [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; frame-src 'none';",
  },
];

// 4. Preview sandboxing — serve user files from Route Handler only
// Never serve via static file serving. Always through decryption pipeline.
// Use iframe with sandbox attribute for in-browser preview:
// <iframe sandbox="allow-same-origin" src="/api/files/{id}/preview" />
```

> [!CAUTION]
> **Never** pass user-provided filenames or content to `child_process.exec()`, `eval()`, or template strings that construct shell commands. All file processing (sharp, ffmpeg) must use Buffer/stream APIs only.

---

## 12. Password Reset & Email Verification

### Forgot Password Flow

```mermaid
sequenceDiagram
    actor User
    participant App as SecureVault
    participant DB as MariaDB
    participant Email as Resend

    User->>App: GET /forgot-password
    User->>App: POST /api/auth/forgot-password {email}
    App->>DB: Find user by email
    App->>App: Generate reset token (nanoid + SHA-256 hash)
    App->>DB: Store hashed token (expires in 1 hour)
    App->>Email: Send reset link with token
    Email-->>User: Email with reset link

    User->>App: GET /reset-password?token=...
    App->>App: POST /api/auth/reset-password {token, newPassword}
    App->>DB: Verify token hash + not expired
    App->>App: Hash new password (Argon2id)
    App->>DB: Update password, delete token
    App->>DB: Invalidate ALL sessions (force re-login everywhere)
    App-->>User: Password reset successful
```

> [!NOTE]
> UEK does NOT need re-encryption on password change — it's encrypted with MK, not derived from password.

### Email Verification Flow

```mermaid
sequenceDiagram
    actor User
    participant App as SecureVault
    participant DB as MariaDB
    participant Email as Resend

    User->>App: POST /api/auth/signup
    App->>DB: Create user (email_verified = false)
    App->>Email: Send verification link (token, 24h expiry)

    User->>App: GET /verify-email?token=...
    App->>DB: Mark email_verified = true
    App-->>User: Email verified, full access granted
```

- **Unverified users**: Can log in but cannot upload, share, or use AI agent
- **Feature gate enforcement**: Check `email_verified` in `getCurrentUser()` and throw a specific error / return a restricted user object. All Server Actions and Route Handlers for upload, share, and AI must reject unverified users with a clear "Please verify your email" response.
- **Schema addition**: `email_verified: boolean('email_verified').default(false)`

---

## 13. Rate Limiting

Using `@upstash/ratelimit` with **Upstash Redis** (free tier: 10k requests/day). In-memory rate limiting does **not work on Vercel** because each serverless invocation may be a new instance — the in-memory Map resets between invocations.

| Endpoint                         | Limit        | Window | Key             |
| -------------------------------- | ------------ | ------ | --------------- |
| `POST /api/auth/login`           | 5 attempts   | 15 min | IP + email      |
| `POST /api/auth/forgot-password` | 3 attempts   | 15 min | IP              |
| `POST /api/auth/signup`          | 5 attempts   | 1 hour | IP              |
| `POST /api/share/verify-otp`     | 3 attempts   | 5 min  | IP + link token |
| `POST /api/upload/*`             | 100 requests | 1 min  | user ID         |
| `GET /api/files/*/download`      | 30 requests  | 1 min  | user ID or IP   |

```typescript
// lib/rate-limit.ts (Upstash Redis — works on Vercel serverless)
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(5, "15 m"),
  analytics: true,
  prefix: "ratelimit:auth",
});

export const uploadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(100, "1 m"),
  analytics: true,
  prefix: "ratelimit:upload",
});
```

---

## 14. Two-Factor Authentication (2FA / TOTP) — ⏳ OPTIONAL STRETCH GOAL

> [!NOTE]
> **Not in MVP scope.** Implement only if time permits after core features are stable. This section is kept as a reference for post-MVP enhancement.

### Setup Flow

```mermaid
sequenceDiagram
    actor User
    participant App as SecureVault

    User->>App: Enable 2FA in settings
    App->>App: Generate TOTP secret (otpauth library)
    App-->>User: Show QR code + backup codes
    User->>App: Enter 6-digit code to confirm
    App->>App: Verify code against secret
    App->>DB: Store encrypted TOTP secret, mark 2FA enabled
```

### Login with 2FA

```mermaid
sequenceDiagram
    actor User
    participant App as SecureVault

    User->>App: Login (email + password)
    App->>App: Password valid
    alt 2FA enabled
        App-->>User: Prompt for 6-digit TOTP code
        User->>App: Enter code
        App->>App: Verify TOTP (30s window, 1 drift)
        App-->>User: Session created
    else 2FA not enabled
        App-->>User: Session created
    end
```

- **Library**: `otpauth` (lightweight, standards-compliant)
- **Backup codes**: 8 one-time codes, hashed in DB, shown once during setup
- **Schema addition**: `totp_secret: blob('totp_secret')` (encrypted with MK), `two_factor_enabled: boolean`

---

## 15. Folder Sharing

Extends the existing share link system to support folders.

| Behavior                    | Implementation                                                  |
| --------------------------- | --------------------------------------------------------------- |
| Share a folder              | Create share link with `folder_id` instead of `file_id`         |
| Access shared folder        | Viewer sees folder contents, can browse subfolders              |
| Download from shared folder | Individual file downloads only (no bulk ZIP for MVP)            |
| Permissions                 | Same as file sharing — expiry, email allowlist, OTP, revocation |

### Schema Change

```typescript
// share_links table — make file_id nullable, add folder_id
file_id: varchar('file_id', { length: 21 }),      // nullable
folder_id: varchar('folder_id', { length: 21 }),   // nullable
// Constraint: exactly one of file_id or folder_id must be set
```

### Folder Share Viewer UI

The `/s/[token]` page must handle folder shares differently from file shares:

- **Folder listing view**: show folder name, files with icon/name/size, and subfolders
- **Subfolder navigation**: clicking a subfolder loads its contents (same share token, subfolder path in query param)
- **Individual file download**: each file has a download button
- **No bulk ZIP for MVP**: download one file at a time
- **Breadcrumb**: show folder → subfolder path within the shared context

---

## 16. Activity / Audit Log UI

The DB already stores `share_link_access_logs`. This adds a user-facing UI.

### What the Owner Sees

| Event             | Data Shown                                       |
| ----------------- | ------------------------------------------------ |
| **File accessed** | Who (email or "anonymous"), when, via which link |
| **File uploaded** | filename, size, timestamp                        |
| **File shared**   | link created, expiry, allowlist                  |
| **Link revoked**  | which link, when                                 |

- Route: `/dashboard/activity`
- Query: Join `share_link_access_logs` + `share_links` + `files` for the current user
- Paginated, newest first

---

## 17. Thumbnail Generation

Since files are encrypted in R2, thumbnails must be generated **during upload** and stored separately.

### Flow

```mermaid
sequenceDiagram
    participant Client as Browser
    participant RH as Route Handler
    participant R2 as Cloudflare R2

    Client->>RH: POST /api/upload/complete
    RH->>RH: Detect mime type
    alt Image (jpg, png, webp, gif)
        RH->>RH: sharp → resize to 256x256 thumbnail
    else PDF
        RH->>RH: pdf-image (first page) → thumbnail
    else Video (mp4, webm)
        RH->>RH: ffmpeg frame extract → thumbnail
    else Other
        RH->>RH: Use generic icon based on mime type
    end
    RH->>RH: Encrypt thumbnail with same FEK
    RH->>R2: PUT {fileId}/thumbnail
    RH->>DB: Set has_thumbnail = true
```

### Implementation Notes

| File Type     | Thumbnail Strategy                       | Library                           |
| ------------- | ---------------------------------------- | --------------------------------- |
| **Images**    | Resize to 256x256, preserve aspect ratio | `sharp`                           |
| **PDFs**      | Render first page as image               | `pdf-image` or `pdfjs-dist`       |
| **Videos**    | Extract frame at 1s                      | `ffmpeg-static` + `fluent-ffmpeg` |
| **Documents** | Generic file-type icon (no generation)   | Static SVG icons                  |
| **Audio**     | Generic audio icon with waveform color   | Static SVG                        |

- Thumbnails encrypted with the **same FEK** as the file — one key to rule them all
- Stored at `/{userId}/thumbnails/{fileId}.webp` in R2 (per-user folder)
- Served via `GET /api/files/{id}/thumbnail` with same auth + decryption flow
- **Size cap**: Thumbnails max 50KB after compression (WebP format)

> [!TIP]
> For the hackathon, start with **images only** (sharp). Add PDF/video thumbnail support as stretch goals — they require heavier dependencies.

### Schema Addition

```typescript
// Add to files table
has_thumbnail: boolean('has_thumbnail').default(false),
thumbnail_r2_key: varchar('thumbnail_r2_key', { length: 255 }),
```

---

## 18. Resumable Upload Protocol

The chunked upload design already supports resumability. Here's the detailed protocol:

### State Machine

```mermaid
stateDiagram-v2
    [*] --> Initialized: POST /api/upload/init
    Initialized --> Uploading: First chunk received
    Uploading --> Uploading: More chunks
    Uploading --> Completing: All chunks received
    Completing --> Ready: POST /api/upload/complete
    Uploading --> Paused: User pauses / tab closes
    Paused --> Uploading: Resume from last chunk
    Uploading --> Failed: 3 consecutive retries fail
    Failed --> Uploading: User retries
    Initialized --> Expired: 24h cleanup job
    Paused --> Expired: 24h cleanup job
```

### Concurrent Upload Deduplication

If a user starts uploading the same file twice simultaneously, the server must detect and prevent conflicts:

- On `POST /api/upload/init`: check for existing `upload_sessions` with the same `user_id` + `file_name` + `file_size` in status `initialized` or `uploading`
- If found: return the existing `uploadId` (resume) instead of creating a duplicate
- This prevents duplicate R2 blobs and quota double-counting

### Client-Side Resume Logic

```typescript
// hooks/use-upload.ts (simplified)
async function uploadFile(file: File) {
  // 1. Check for existing incomplete upload
  const existing = await checkResumableUpload(file.name, file.size);

  let uploadId: string;
  let startChunk: number;

  if (existing) {
    // Resume: skip already-uploaded chunks
    uploadId = existing.uploadId;
    startChunk = existing.completedChunks;
  } else {
    // New upload
    const init = await initUpload(file.name, file.size, file.type);
    uploadId = init.uploadId;
    startChunk = 0;
  }

  // 2. Upload remaining chunks with retry
  for (let i = startChunk; i < totalChunks; i++) {
    const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await uploadChunkWithRetry(uploadId, i, chunk, { maxRetries: 3 });
    onProgress((i + 1) / totalChunks); // Update progress bar
  }

  // 3. Finalize
  await completeUpload(uploadId);
}
```

### Server-Side Tracking

```sql
-- upload_sessions table tracks resumable state
CREATE TABLE upload_sessions (
  id VARCHAR(21) PRIMARY KEY,
  user_id VARCHAR(21) NOT NULL,
  file_id VARCHAR(21) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  total_chunks INT NOT NULL,
  completed_chunks INT DEFAULT 0,
  status ENUM('initialized', 'uploading', 'completing', 'ready', 'failed', 'expired'),
  expires_at TIMESTAMP NOT NULL,  -- 24h from creation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Cleanup Job

- **Stale uploads** (status = `initialized` or `uploading` for > 24h) → mark as `expired`, delete R2 chunks, reclaim quota
- Run via **Vercel Cron** (`vercel.json` cron) or a scheduled server action

---

## 19. File Editing, Versioning & Other UX Essentials

> [!NOTE]
> **File Versioning and Bulk Download (ZIP) are not in MVP scope.** They are retained below as reference for post-MVP enhancement.

### File Editing Strategy

Since files are encrypted server-side, **in-browser editing is not supported**. Instead:

```mermaid
flowchart LR
    A["User clicks Edit"] --> B["Download decrypted file"]
    B --> C["User edits locally"]
    C --> D["Re-upload as new version"]
    D --> E["Old version archived or replaced"]
```

| Approach             | Pros                     | Cons                               | Recommendation     |
| -------------------- | ------------------------ | ---------------------------------- | ------------------ |
| **Replace in-place** | Simple, no version bloat | Destructive, no undo               | ❌ Not recommended |
| **Version history**  | Undo, audit trail, diff  | Storage cost (counts toward quota) | ✅ **Use this**    |
| **Copy-on-write**    | Non-destructive          | Confusing UX (two files?)          | ❌                 |

### Version History Design (Non-MVP Stretch Goal)

```sql
-- file_versions table
CREATE TABLE file_versions (
  id VARCHAR(21) PRIMARY KEY,
  file_id VARCHAR(21) NOT NULL,       -- parent file
  version_number INT NOT NULL,
  size BIGINT NOT NULL,
  total_chunks INT NOT NULL,
  encrypted_fek BLOB NOT NULL,         -- each version has its own FEK
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_id, version_number)
);
```

- **Re-upload flow**: "Upload new version" button → creates new `file_version` + new chunks in R2
- **Latest version** is always served by default
- **Restore old version**: Promotes an old version to latest
- **Version limit**: Keep last 5 versions per file (configurable). Older versions auto-deleted.
- **Storage**: All versions count toward user's 1GB quota

---

### Other UX-Critical Features

#### Trash / Soft Delete

| Behavior         | Implementation                                                          |
| ---------------- | ----------------------------------------------------------------------- |
| Delete file      | Set `deleted_at` timestamp (soft delete)                                |
| Trash view       | Query `WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - 30 days`   |
| Restore          | Clear `deleted_at`                                                      |
| Permanent delete | After 30 days, cron job deletes R2 chunks + DB records + reclaims quota |
| Empty trash      | User can manually trigger permanent delete of all trashed files         |

```typescript
// Add to files table
deleted_at: timestamp('deleted_at'),
```

#### Drag & Drop Upload

- Use `react-dropzone` for drag-and-drop file selection
- Visual drop zone with upload progress overlay
- Support multi-file drop → queued chunked uploads

#### Bulk Operations

| Operation           | Implementation                                                   |
| ------------------- | ---------------------------------------------------------------- |
| **Select multiple** | Checkbox selection in file explorer                              |
| **Bulk delete**     | Move all selected to trash                                       |
| **Bulk download**   | _(Not in MVP)_ — Stream as ZIP (server-side zip with `archiver`) |
| **Bulk move**       | Update `folder_id` for all selected                              |
| **Bulk share**      | Create one share link for multiple files (via folder or batch)   |

#### File Rename & Move

- **Rename**: Server action updates `files.name` in DB. No R2 changes needed.
- **Move to folder**: Server action updates `files.folder_id`. No R2 changes needed.
- Both are instant operations since file content stays in R2 unchanged.

#### Search & Filter

| Method           | Use Case                                           |
| ---------------- | -------------------------------------------------- |
| **Quick filter** | Client-side filter by name/type on current folder  |
| **Full search**  | MariaDB `LIKE` or `FULLTEXT` index on `files.name` |
| **AI search**    | Natural language via the AI agent (Section 7)      |

#### Storage Usage Dashboard

- Show used/total quota with progress bar
- Breakdown by file type (images, documents, videos, etc.)
- Largest files list for easy cleanup

#### Error Pages

Custom error pages for a polished UX:

| Page              | File                            | Purpose                                          |
| ----------------- | ------------------------------- | ------------------------------------------------ |
| **404**           | `src/app/not-found.tsx`         | File not found, invalid share link, etc.         |
| **Error**         | `src/app/error.tsx`             | Unhandled runtime errors with "try again" button |
| **Share expired** | Part of `/s/[token]` page logic | Clean "Link Expired" or "Access Denied" UI       |

#### Mobile Responsiveness

All UI components must be responsive for mobile/tablet:

- File explorer grid → single column on mobile, 2-col on tablet
- Sidebar → collapsible hamburger menu on mobile
- Upload dialog → full-screen modal on mobile
- Share link viewer → mobile-optimized layout
- Touch-friendly: adequate tap targets (min 44px), swipe gestures for actions

#### UX Feedback Patterns

Application-wide UX patterns that must be integrated everywhere:

| Pattern                  | Implementation                      | Where                                                    |
| ------------------------ | ----------------------------------- | -------------------------------------------------------- |
| **Toast notifications**  | shadcn `toast` component            | Upload complete, link copied, file deleted, errors       |
| **Loading skeletons**    | shadcn `skeleton` component         | File grid while loading, settings page, activity log     |
| **Confirmation dialogs** | shadcn `alert-dialog`               | Delete file, empty trash, revoke link, permanent delete  |
| **Error boundaries**     | Next.js `error.tsx` per route group | Graceful error recovery with "try again"                 |
| **Suspense boundaries**  | React `<Suspense>` + `loading.tsx`  | Every page that fetches data — prevents blank-page flash |

```typescript
// Example: src/app/(dashboard)/files/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return <div className="grid grid-cols-4 gap-4">
    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
  </div>;
}
```

#### Settings Page

Route: `/dashboard/settings` — user account management:

| Section      | Features                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Profile**  | Change display name, view email                                                                                       |
| **Security** | Change password (verify current → set new), enable/disable 2FA (stretch)                                              |
| **Devices**  | List active sessions with device name, IP, last active. "Revoke" button per device, "Revoke all other devices" button |
| **Storage**  | Usage bar, breakdown by type, largest files (from Phase 14)                                                           |
| **Logout**   | Logout button (current device) at bottom                                                                              |

#### Email HTML Templates

All transactional emails (OTP, password reset, email verification) should use a consistent branded HTML template:

- Simple, responsive HTML email (inline CSS, table-based layout)
- Brand header with SecureVault logo/name
- Clear call-to-action button (verify link, reset link)
- OTP displayed prominently with monospace font
- Footer with "If you didn't request this, ignore this email"
- Template file: `src/lib/email/templates.ts` — functions that return HTML strings

---

## 20. API Operation Scoping (Application-Level RLS)

MariaDB does not have native Row-Level Security. All data isolation is enforced at the application layer via a **scoped service pattern**.

### Service Layer Pattern

```typescript
// lib/services/file-service.ts
export function createFileService(userId: string) {
  return {
    async list(folderId?: string) {
      return db.query.files.findMany({
        where: and(
          eq(files.userId, userId), // Always scoped
          folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
          isNull(files.deletedAt),
        ),
      });
    },

    async getById(fileId: string) {
      const file = await db.query.files.findFirst({
        where: and(eq(files.id, fileId), eq(files.userId, userId)),
      });
      if (!file) throw new Error("File not found"); // Same error for not-found vs forbidden
      return file;
    },

    async delete(fileId: string) {
      return db
        .update(files)
        .set({ deletedAt: new Date() })
        .where(and(eq(files.id, fileId), eq(files.userId, userId)));
    },
  };
}
```

### Request Flow

```
Request → Middleware (validate __Secure-session cookie)
       → Server Action / Route Handler
       → getCurrentUser(cookies)            ← extract userId from __Secure-session
       → createFileService(userId)          ← scope ALL queries to this user
       → db.query (WHERE user_id = ?)       ← enforced at every query
```

### IDOR Protection

| Risk                            | Protection                                                       |
| ------------------------------- | ---------------------------------------------------------------- |
| User A reads User B's file      | `WHERE user_id = ?` on every query                               |
| User A deletes User B's file    | Mutation queries also scoped by userId                           |
| Changing `fileId` in URL (IDOR) | `getById` checks both `fileId` AND `userId`                      |
| Error leakage                   | "Not found" for both missing and forbidden (no distinction)      |
| Shared file access              | Separate code path: validates share link token, not user session |

---

## 21. Timezone Handling

**Rule: Store UTC, Display Local.**

| Layer                | Timezone     | How                                                       |
| -------------------- | ------------ | --------------------------------------------------------- |
| **MariaDB**          | UTC always   | `TIMESTAMP` columns store UTC. Set `time_zone = '+00:00'` |
| **Server (Vercel)**  | UTC always   | All expiry checks compare UTC vs UTC                      |
| **Client (browser)** | User's local | `Intl.DateTimeFormat` auto-converts UTC → local           |

```typescript
// SERVER — expiry checks (UTC vs UTC, no ambiguity)
const isExpired = shareLink.expiresAt < new Date(); // Both UTC ✅

// SERVER — creating expiry
const expiresAt = new Date(Date.now() + durationMs); // UTC ✅

// CLIENT — display in user's local timezone
function formatDate(utcDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(utcDate)); // Auto-detects user timezone
}
```

> [!CAUTION]
> Never construct dates from timezone-unaware strings on the server. Always use `new Date()` (UTC) or ISO strings with `Z` suffix.

---

## 21.5. Background Jobs / Cron

Two cron jobs consolidated into a single Route Handler:

| Job                      | Trigger       | Action                                                                                                                                                                  |
| ------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stale upload cleanup** | Every 6 hours | Find `upload_sessions` with status `initialized`/`uploading` created > 24h ago. Delete R2 chunks, mark `expired`, reclaim quota.                                        |
| **Trash auto-purge**     | Daily         | Find `files` with `deleted_at` > 30 days ago. Delete R2 chunks + thumbnail. Delete `file_chunks`, `file_versions`, `share_links` cascade. Reclaim `storage_used` quota. |

- Route: `src/app/api/cron/cleanup/route.ts`
- Protected by a `CRON_SECRET` header to prevent unauthorized invocation
- Configured via `vercel.json` cron schedule:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

---

## 22. Security Testing Strategy

We will use **Vitest** for unit/integration testing (faster than Jest, native ESM) and **Playwright** for E2E testing to validate security constraints automatically.

### 1. Automated Security Tests (Vitest)

| Test Suite                | What It Catches                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- |
| **Encryption round-trip** | Encrypt `→` decrypt returns exact original bytes.                                  |
| **Key isolation**         | User A's FEK throws error when trying to decrypt User B's file.                    |
| **Auth middleware**       | Unauthenticated requests to protected routes return `401 Unauthorized`.            |
| **IDOR protection**       | Requesting `fileId` belonging to User A returns `404` when User B calls `getById`. |
| **Rate limit**            | 6th login attempt within 15min returns `429 Too Many Requests`.                    |
| **OTP expiry**            | Expired OTP returns `401 Unauthorized`.                                            |

```typescript
// Example: tests/security/encryption.test.ts (Vitest)
import { describe, it, expect } from "vitest";
import { encryptFile, decryptFile } from "@/lib/crypto";
import { randomBytes } from "crypto";

describe("Encryption Layer Security", () => {
  it("should not allow decryption with another user's key", async () => {
    const userA_UEK = randomBytes(32);
    const userB_UEK = randomBytes(32);
    const fileData = Buffer.from("Top secret payload");

    const encrypted = await encryptFile(fileData, userA_UEK);
    await expect(decryptFile(encrypted, userB_UEK)).rejects.toThrow();
  });
});
```

### 2. E2E Security Tests (Playwright)

| Scenario              | Validation                                                           |
| --------------------- | -------------------------------------------------------------------- |
| **Link Revocation**   | Create link `→` hit URL (success) `→` revoke link `→` hit URL (404). |
| **OTP Brute Force**   | Share with OTP `→` enter wrong OTP 3 times `→` verify lockout.       |
| **Reset Token Reuse** | Request password reset `→` use link `→` use link again (fails).      |

### 3. Manual Pre-Deployment Checklist

Before deploying to Vercel production:

- [ ] **Cookie Flags:** Check DevTools → Application → Cookies to verify `HttpOnly`, `Secure` (production), `SameSite=Strict`.
- [ ] **Security Headers:** Scan the deployed URL with `securityheaders.com` (expect A rating).
- [ ] **Quota Enforcement:** Attempt to upload a file that pushes usage > 1GB, verify the server rejects it before starting the chunk upload.
- [ ] **Token Enumeration:** Try hitting `/s/[random-string]` and verify a generic 404 page is shown with no info leakage.

---

## Confirmed Decisions

| Decision            | Choice                                   |
| ------------------- | ---------------------------------------- |
| **MariaDB hosting** | Railway (managed, free tier)             |
| **Email provider**  | Resend (100 free emails/day)             |
| **File size cap**   | 100MB per file                           |
| **Storage quota**   | 1GB per user                             |
| **Backend**         | Next.js only (no Express)                |
| **Deployment**      | Vercel (Pro recommended for 60s timeout) |
