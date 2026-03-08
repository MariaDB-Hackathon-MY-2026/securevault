# SecureVault — Architecture

## System Diagram

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

## Architecture Decisions

### Why Server-Side Encryption (Not Client-Side)?

- **Simplicity**: No WebCrypto API complexity; no key management in the browser
- **Key hierarchy**: Master Key → User Encryption Key → File Encryption Key managed on server
- **Control**: Server can enforce policies (quota, rate limits) before accepting data

### Why Chunked Upload?

- **Vercel body limit**: 4.5MB max on serverless functions
- **Resumability**: Failed uploads resume from last successful chunk
- **Memory**: Chunks processed one at a time; no full-file buffering

### Why MariaDB (Not PostgreSQL)?

- Hackathon requirement (MariaDB Hackathon MY 2026)
- Railway provides managed MariaDB with free tier
- Application-level RLS compensates for lack of native row-level security

### Why Cloudflare R2 (Not S3)?

- **Zero egress fees** — file downloads don't incur costs
- S3-compatible API — same `@aws-sdk/client-s3` SDK
- Generous free tier (10GB storage, 10M reads/month)

## Encryption Key Hierarchy (3-Tier)

```mermaid
graph TD
    MK["🔑 Master Key - MK<br/>Environment variable<br/>AES-256 key"]
    --> UEK["🔑 User Encryption Key - UEK<br/>Random per user<br/>Encrypted with MK"]
    --> FEK["🔑 File Encryption Key - FEK<br/>Random per file<br/>Encrypted with UEK"]
    --> FILE["📄 File Data<br/>Encrypted with FEK<br/>AES-256-GCM"]
```

## Data Flow

### Upload (Chunked + Streamed)

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

### Download (Streaming)

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

### Sharing (Access Flow)

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

## Authentication

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

## Forgot Password Flow

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

## Email Verification Flow

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

## Folder Structure

```
securevault/
├── src/
│   ├── app/
│   │   ├── (auth)/login, signup
│   │   ├── (dashboard)/files, shared, settings, chat, activity, trash
│   │   ├── s/[token]/page.tsx         — public share link viewer
│   │   └── api/upload, files, share, chat, auth, cron
│   ├── lib/
│   │   ├── crypto/                    — AES-256-GCM, key mgmt
│   │   ├── auth/                      — sessions, middleware, Argon2id
│   │   ├── storage/                   — R2 client, chunked upload
│   │   ├── db/                        — Drizzle schema, migrations
│   │   ├── services/                  — scoped file/folder/share services
│   │   ├── ai/                        — tools, prompts (stretch)
│   │   └── email/                     — OTP & verification sender
│   ├── components/
│   │   ├── ui/                        — shadcn components
│   │   ├── file-explorer/             — grid/list view, toolbar
│   │   ├── upload/                    — upload dialog + progress
│   │   ├── share/                     — share link management
│   │   └── chat/                      — AI chat (stretch)
│   ├── hooks/                         — useUpload, useFiles
│   └── middleware.ts                  — auth guard
├── docs/                              — project documentation
├── resources/                         — security standards & references
├── tasks/                             — phase-based task breakdown
├── drizzle.config.ts
└── next.config.ts
```

## Database Schema (ER Diagram)

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
    files ||--o{ file_versions : has
```

See full schema details in the [implementation plan](../tasks/README.md).
