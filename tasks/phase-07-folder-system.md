# Phase 7 — Folder System

> **Objective:** Implement folder CRUD, nested folder navigation, and breadcrumb UI.

**Depends on:** Phase 6 (File Management UI)  
**Blueprint ref:** Sections 8 (Schema: folders), 15 (Folder Sharing)

---

## Tasks

- [ ] **7.1 — Implement folder service**
  - File: `src/lib/services/folder-service.ts`
  - `createFolderService(userId: string)` — scoped by user
  - Methods: `create(name, parentId?)`, `list(parentId?)`, `rename(folderId, name)`, `delete(folderId)`, `getPath(folderId)` (for breadcrumbs)

- [ ] **7.2 — Build create folder dialog**
  - File: `src/components/file-explorer/create-folder-dialog.tsx`
  - Input for folder name + Create button
  - Server action: validates name, creates folder record

- [ ] **7.3 — Build breadcrumb navigation**
  - File: `src/components/file-explorer/breadcrumbs.tsx`
  - Shows: Home > Folder A > Subfolder B
  - Each segment is clickable to navigate up

- [ ] **7.4 — Integrate folders into file explorer**
  - Update `file-grid.tsx` and `file-list.tsx` to show folders before files
  - Click folder → navigate into it (update folderId query param)
  - Double-click or Enter to open folder

- [ ] **7.5 — Implement folder move**
  - Move files into folders, move folders into other folders
  - Prevent circular references (folder A inside folder B inside folder A)

- [ ] **7.6 — Implement folder delete**
  - Soft-delete folder + all contained files recursively
  - Confirm dialog: "This will delete X files and Y sub-folders"

---

## Deliverables

| Output               | Location                                                |
| -------------------- | ------------------------------------------------------- |
| Folder service       | `src/lib/services/folder-service.ts`                    |
| Create folder dialog | `src/components/file-explorer/create-folder-dialog.tsx` |
| Breadcrumbs          | `src/components/file-explorer/breadcrumbs.tsx`          |

---

## Testing

### Automated (Vitest)

```bash
npx vitest run tests/services/folder
```

| Test                                       | Expected                               |
| ------------------------------------------ | -------------------------------------- |
| Create folder at root                      | Folder created with `parent_id = null` |
| Create nested folder                       | Folder has correct `parent_id`         |
| `getPath` returns correct breadcrumb chain | Returns array of ancestors             |
| Delete folder cascades to files            | File `deleted_at` set                  |
| Prevent circular folder move               | Throws error                           |

### Manual Verification

1. Create a folder "Documents" → verify it appears in file explorer
2. Navigate into "Documents" → create a subfolder "Taxes" → verify breadcrumbs show `Home > Documents > Taxes`
3. Upload file into "Taxes" → navigate back to Home → verify file not visible at root
4. Delete "Documents" → verify all nested content gone from main view
