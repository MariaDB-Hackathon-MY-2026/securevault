# Phase 13 — Activity / Audit Log UI

> **Objective:** Build user-facing audit log showing file access events, shares, and uploads.

**Depends on:** Phase 8 (Sharing — access logs exist)  
**Blueprint ref:** Section 16 (Activity / Audit Log UI)

---

## Tasks

- [ ] **13.1 — Implement activity service**
  - File: `src/lib/services/activity-service.ts`
  - `getActivity(userId, page, pageSize)` — joins access_logs + share_links + files
  - Events: file accessed, file uploaded, link created, link revoked
  - Paginated, newest first

- [ ] **13.2 — Build activity page**
  - File: `src/app/(dashboard)/activity/page.tsx`
  - Timeline-style list showing events with icons
  - Each event: type icon, description, who/when, link to file

- [ ] **13.3 — Add activity nav link**
  - Add "Activity" to dashboard sidebar

---

## Testing

| Test                                          | Expected                    |
| --------------------------------------------- | --------------------------- |
| Share link accessed → appears in activity log | Event logged                |
| Activity page paginated                       | Next page loads more events |
| Activity scoped to current user only          | No cross-user leaks         |
