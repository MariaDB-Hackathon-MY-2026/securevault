# SecureVault 5-Minute Pitch Video Script

Use a confident founder tone: calm, premium, technical when it matters.

| Time | Visual / Demo | Voiceover |
|---:|---|---|
| `0:00-0:25` | Landing page, slow zoom on product headline. | "Every team has sensitive files. Contracts, reports, IDs, financial documents. But most storage tools force a tradeoff: easy sharing, or serious control. SecureVault is our answer: secure file storage with encrypted-at-rest uploads, governed sharing, lifecycle controls, and semantic retrieval, built on MariaDB as the operational backbone." |
| `0:25-0:55` | Quick architecture graphic: Browser -> Next.js -> MariaDB/R2/Redis/Gemini. | "This is not a mock upload form. SecureVault is a full-stack storage system: Next.js 16 and React 19 for the product, Cloudflare R2 for encrypted object storage, Redis for coordination, Gemini embeddings for semantic retrieval, and MariaDB 12 powering the durable core: identity, sessions, file metadata, upload state, shares, quotas, trash, activity, and semantic vectors." |
| `0:55-1:20` | Show full Docker Compose setup commands. | "Setup is reproducible through the full Compose service path. Create `secure-vault/.env.local` with the MariaDB, R2, Redis, encryption, and Gemini settings, then from the repo root run `docker compose --profile app build --no-cache` and `docker compose --profile app up`. Compose starts MariaDB, Redis, runs migrations through the `migrate` service, and then brings up the production-built web container. If we want the queued embedding worker path, we add `--profile worker`." |
| `1:20-2:05` | Demo login, Files page, upload PDF. Show upload queue. | "Now the product flow. I sign in and enter the vault. When I upload a PDF, the browser chunks the file, the app coordinates active upload slots, each chunk is encrypted before storage, and MariaDB tracks the upload session, file readiness, chunk metadata, and quota impact. Upload finalization is transactional, so the file, session, and quota update together. That consistency is exactly why MariaDB matters here." |
| `2:05-2:45` | Show file explorer: folders, preview, storage, activity. | "Once the file is ready, SecureVault behaves like a real workspace. I can organize folders, preview files, rename, move, delete, restore from trash, and inspect storage usage. Activity is not fake frontend state; it is assembled from persisted file and sharing events. The result feels operational, not decorative." |
| `2:45-3:30` | Create restricted share link with allowed email, download limit, expiry. Open shared link in another browser/session, request OTP. | "Sharing is where SecureVault becomes more than private storage. I can create a public or restricted link, allow only specific emails, set expiry or download governance, and revoke access later. For restricted links, MariaDB stores the allowlist, hashed OTP state, expiry, attempt counts, revocation, download count, and access logs. The recipient unlocks with OTP, and for shared PDFs, SecureVault can serve secure rendered image previews instead of handing over raw PDF bytes immediately." |
| `3:30-4:20` | Switch to semantic search. Search natural query like "policy about retention after deletion" or "document about onboarding risk". Show page match. | "Now the premium layer: semantic search. SecureVault indexes eligible PDFs and images without blocking normal storage. It stores embedding jobs and `vector(1536)` chunks in MariaDB. When I search by meaning, the API authenticates me, embeds the query, ranks only my ready, non-deleted files using MariaDB cosine-distance retrieval, and fuses semantic results with filename matches. AI is not bolted on as a separate silo; it is grounded inside the same MariaDB-backed ownership and access model." |
| `4:20-4:45` | Show benchmark report screenshots or terminal report files. | "We also benchmarked it. The checked-in retrieval benchmark from April 20, 2026 shows roughly 1.1 second P95 retrieval latency on a seeded 1,000-file, 3,000-chunk dataset after indexing. The pipeline benchmark, using live Google embeddings, achieved 100% Top-1 accuracy on the controlled sampled suite, and in the harder stress suite kept the correct file in the Top-3 for every sampled query. We state that carefully: retrieval speed and indexing quality are measured separately." |
| `4:45-5:00` | Return to dashboard, end on logo/architecture/MariaDB badge. | "SecureVault wins because it uses MariaDB for both trust and intelligence: transactional file operations, governed sharing, audit-friendly metadata, and vector-backed semantic search. It is secure storage that users can actually operate, and a technical foundation that can grow into a serious product." |

## Best Demo Order

1. Landing page.
2. Terminal setup commands.
3. Login to `/files`.
4. Upload PDF and show queue.
5. Preview file, storage, activity.
6. Create restricted share link.
7. OTP unlock in clean session.
8. Semantic search.
9. Benchmark report.
10. Close with MariaDB architecture.

## Important Wording

Say "encrypted at rest" or "application-managed encryption," not "end-to-end encryption."

Avoid "ANN vector index"; the accurate claim is MariaDB `vector(1536)` storage with cosine-distance ranking.
