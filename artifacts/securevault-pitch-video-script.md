# SecureVault 5-Minute Pitch Video Script

Use a confident founder tone: calm, premium, and not rushed. Let the demo breathe.

| Time | Visual / Demo | Voiceover |
|---:|---|---|
| `0:00-0:25` | Landing page, slow zoom on product headline. | "Teams store sensitive files every day: contracts, reports, IDs, and financial records. SecureVault gives them secure storage, controlled sharing, and semantic search, with MariaDB at the center." |
| `0:25-0:55` | Quick architecture graphic: Browser -> Next.js -> MariaDB/R2/Redis/Gemini. | "This is a real full-stack product. Next.js powers the app. R2 stores encrypted file chunks. Redis handles coordination. Gemini powers semantic retrieval. MariaDB keeps the durable truth: users, sessions, files, shares, uploads, quotas, activity, and vectors." |
| `0:55-1:20` | Demo login and enter the Files workspace. | "Now let us move into the product. I sign in and land inside the vault, where files, folders, sharing, storage, trash, and activity all live in one workspace." |
| `1:20-2:05` | Upload PDF. Show upload queue. | "When I upload a PDF, SecureVault chunks the file, coordinates upload slots, encrypts chunks before storage, and tracks the whole lifecycle in MariaDB. When upload completes, MariaDB finalizes file readiness, session state, and quota together." |
| `2:05-2:45` | Show file explorer: folders, preview, storage, activity. | "The file is now part of a real workspace. I can organize folders, preview files, rename, move, delete, restore from trash, and inspect storage usage. Activity is persisted, so the product feels accountable, not cosmetic." |
| `2:45-3:30` | Create restricted share link with allowed email, download limit, expiry. Open shared link in another browser/session, request OTP. | "Sharing is governed. I can create a restricted link, allow specific emails, set limits, and revoke access later. MariaDB stores the allowlist, OTP state, expiry, download count, and access logs. The recipient unlocks with OTP, and shared PDFs can be previewed as rendered images instead of exposing raw PDF bytes first." |
| `3:30-4:20` | Switch to semantic search. Search natural query like "policy about retention after deletion" or "document about onboarding risk". Show page match. | "Semantic search is built into the storage model. PDFs and images are indexed with Gemini, then stored as `vector(1536)` chunks in MariaDB. When I search by meaning, SecureVault ranks only my authorized files using cosine-distance retrieval, then blends semantic and filename results." |
| `4:20-4:45` | Show benchmark report screenshots or terminal report files. | "The benchmark story is clear. The April 20, 2026 retrieval report shows about 1.1 second P95 latency on 1,000 files and 3,000 chunks after indexing. The pipeline benchmark shows 100% Top-1 accuracy on the controlled suite, and Top-3 recall across every sampled stress query." |
| `4:45-5:00` | Return to dashboard, end on logo/architecture/MariaDB badge. | "SecureVault wins because MariaDB powers both trust and intelligence: reliable file operations, governed sharing, audit-friendly data, and vector-backed search. It is secure storage that can grow into a serious product." |

## Best Demo Order

1. Landing page.
2. Login to `/files`.
3. Upload PDF and show queue.
4. Preview file, storage, activity.
5. Create restricted share link.
6. OTP unlock in clean session.
7. Semantic search.
8. Benchmark report.
9. Close with MariaDB architecture.

## Important Wording

Say "encrypted at rest" or "application-managed encryption," not "end-to-end encryption."

Avoid "ANN vector index"; the accurate claim is MariaDB `vector(1536)` storage with cosine-distance ranking.
