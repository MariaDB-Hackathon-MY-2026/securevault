# SecureVault - Technology Stack

## Core Stack

| Layer              | Technology     | Version         | Purpose                              |
| ------------------ | -------------- | --------------- | ------------------------------------ |
| **Runtime**        | Node.js        | 20+ LTS         | Server runtime                       |
| **Framework**      | Next.js        | 15 (App Router) | Full-stack React framework           |
| **Language**       | TypeScript     | 5.x             | Type safety                          |
| **UI Library**     | shadcn/ui      | latest          | Component library (Radix + Tailwind) |
| **Styling**        | Tailwind CSS   | 3.x / 4.x       | Utility-first CSS                    |
| **State/Fetching** | TanStack Query | 5.x             | Server state management + caching    |

## Database & ORM

| Technology         | Purpose                                               | Hosting                      |
| ------------------ | ----------------------------------------------------- | ---------------------------- |
| **MariaDB**        | Metadata, encryption keys, auth, sharing              | Railway (managed, free tier) |
| **MariaDB Vectors**| PDF semantic chunk storage + cosine search            | Same MariaDB cluster         |
| **Drizzle ORM**    | Type-safe SQL queries, schema definition, migrations  | -                            |
| **mysql2**         | MariaDB driver with connection pooling (enforces UTC) | -                            |

## Storage

| Technology             | Purpose                             | Hosting                |
| ---------------------- | ----------------------------------- | ---------------------- |
| **Cloudflare R2**      | Encrypted file blobs and thumbnails | Cloudflare (10GB free) |
| **@aws-sdk/client-s3** | S3-compatible SDK for R2 operations | -                      |

## Security

| Technology           | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| **Node.js `crypto`** | AES-256-GCM encryption/decryption                          |
| **argon2**           | Password hashing (Argon2id)                                |
| **nanoid**           | Cryptographically random IDs and tokens                    |
| **@zxcvbn-ts/core**  | Password strength scoring                                  |
| **file-type**        | Server-side MIME sniffing (prevents content-type spoofing) |

## AI & Semantic Retrieval

| Technology         | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| **Vercel AI SDK**  | Streaming AI chat interface and embedding primitives |
| **@ai-sdk/openai** | Stretch chat model integration                       |
| **@ai-sdk/google** | Gemini embeddings and vision-based OCR fallback      |

## Document Processing

| Technology     | Purpose                                         |
| -------------- | ----------------------------------------------- |
| **pdfjs-dist** | Native text extraction from decrypted PDFs      |
| **OCR adapter layer** | Pluggable vision-model or generic OCR providers |

## Email

| Technology | Purpose                                                 |
| ---------- | ------------------------------------------------------- |
| **Resend** | OTP emails, password reset, verification (100 free/day) |

## Image Processing

| Technology | Purpose                                        |
| ---------- | ---------------------------------------------- |
| **sharp**  | Thumbnail generation (resize, WebP conversion) |

## Testing

| Technology     | Purpose                                         |
| -------------- | ----------------------------------------------- |
| **Vitest**     | Unit and integration testing (fast, native ESM) |
| **Playwright** | E2E browser testing (security scenarios)        |

## Dev Tools

| Tool            | Purpose                                |
| --------------- | -------------------------------------- |
| **drizzle-kit** | Schema migrations (`generate`, `push`) |
| **ESLint**      | Code linting                           |
| **TypeScript**  | Type checking (`tsc --noEmit`)         |

## Deployment

| Service        | Purpose                                           |
| -------------- | ------------------------------------------------- |
| **Vercel**     | Next.js hosting (Pro recommended for 60s timeout) |
| **Railway**    | MariaDB hosting (managed, auto-backups)           |
| **Cloudflare** | R2 object storage                                 |

## NPM Dependencies Summary

### Production

```
next react react-dom
drizzle-orm mysql2
@aws-sdk/client-s3
@tanstack/react-query
nanoid argon2 sharp
@zxcvbn-ts/core
file-type
ai @ai-sdk/google
pdfjs-dist
```

### Development

```
typescript @types/node @types/react
drizzle-kit vitest
tailwindcss postcss autoprefixer
eslint
@playwright/test (E2E)
```
