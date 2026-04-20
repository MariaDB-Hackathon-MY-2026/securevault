# SecureVault - Task Breakdown

> Derived from [`implementation_plan.md`](../implementation_plan.md) (Architecture Blueprint).

## Phase Order

| Phase        | Area                                | Dependency        |
| ------------ | ----------------------------------- | ----------------- |
| **Phase 0**  | Project Setup & Config              | None              |
| **Phase 1**  | Database Schema & ORM               | Phase 0           |
| **Phase 2**  | Encryption Layer                    | Phase 0           |
| **Phase 3**  | Authentication System               | Phase 1, 2        |
| **Phase 4**  | File Upload (Chunked)               | Phase 1, 2, 3     |
| **Phase 5**  | File Download (Streaming)           | Phase 4           |
| **Phase 6**  | File Management UI                  | Phase 4, 5        |
| **Phase 7**  | Folder System                       | Phase 6           |
| **Phase 8**  | Link Sharing & Access Control       | Phase 5, 7, 15.0  |
| **Phase 9**  | Thumbnails                          | Phase 5           |
| **Phase 10** | Trash & Soft Delete                 | Phase 6           |
| **Phase 11** | File Versioning _(stretch)_         | Phase 5           |
| **Phase 12** | Rate Limiting & Security Hardening  | Phase 3, 8        |
| **Phase 13** | Activity / Audit Log UI             | Phase 8           |
| **Phase 14** | Storage Dashboard & Search          | Phase 6           |
| **Phase 15** | Password Reset                      | Phase 3           |
| **Phase 16** | AI Agent _(stretch)_                | Phase 5           |
| **Phase 17** | 2FA / TOTP _(stretch)_              | Phase 3           |
| **Phase 18** | Deployment & Final QA               | All               |
| **Phase 19** | PDF Semantic Indexing & Search      | Phase 1, 4, 5, 14 |
| **Phase 20** | SeaweedFS Migration & Object Storage Abstraction | Phase 4, 5, 9, 10, 18 |
| **Phase 21** | OCR-Backed Hybrid Retrieval         | Phase 1, 2, 4, 5, 14, 19, 20 |

## Structure

Each `phase-XX-*.md` file contains:

- **Objective** - what this phase delivers
- **Tasks** - checklist with sub-items
- **Deliverables** - concrete outputs
- **Testing** - how to verify it works
- **Depends on** - which phases must be done first
