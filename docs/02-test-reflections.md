# Playwright Test Reflections

This note captures the E2E failure patterns we hit while stabilizing the file-management tests and the guardrails we want to keep going forward.

## Main Lessons

### 1. Prefer durable state over transient toasts

Several failures came from waiting on short-lived messages such as `Folder moved`, `Folder renamed`, `Folder deleted`, and `Files deleted`.

Use these instead:

- dialog becomes visible or hidden
- renamed item appears and old item disappears
- moved item is absent from the current view and present in the destination
- deleted item or folder has count `0`
- breadcrumb or folder hierarchy updates

Good:

```ts
const moveDialog = page.getByRole("dialog", { name: "Move folder" });
await moveDialog.getByRole("button", { name: "Move folder", exact: true }).click();
await expect(moveDialog).toBeHidden();
await expect(getGridFolderButton(page, "Projects")).toHaveCount(0);
```

Risky:

```ts
await expect(page.getByText("Folder moved")).toBeVisible();
```

### 2. Helpers must establish their own preconditions

Some tests failed because helpers assumed a modal was already open or already closed.

Rules:

- upload helpers should open the `Upload Files` dialog before calling `setInputFiles`
- page-level actions like `createFolder()` should close the upload dialog first if it blocks interaction
- confirmation helpers should scope to the modal they act on

Good:

```ts
async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(uploadDialog).toBeVisible();
}
```

### 3. Use exact, intent-specific locators for folders

Folder names collided with nearby action controls such as `Open actions for folder Projects`.

Rules:

- use `exact: true` for folder-name buttons
- use a dedicated helper for folder destination buttons inside move dialogs
- do not rely on broad `getByRole("button", { name: folderName })` when other controls include the same text

Good:

```ts
function getGridFolderButton(page: Page, folderName: string) {
  return page.getByRole("button", { name: folderName, exact: true });
}

function getFolderDestinationButton(page: Page, folderName: string) {
  return page.getByRole("dialog").getByRole("button", { name: folderName, exact: true });
}
```

### 4. Match the actual ARIA role

One failure happened because the UI rendered `Delete folder` as an `alertdialog`, while the test was waiting for a `dialog`.

Rule:

- inspect the rendered role in the snapshot and use the real accessible role in Playwright locators

Good:

```ts
await expect(page.getByRole("alertdialog", { name: "Delete folder" })).toContainText(
  "This will permanently delete 1 file and 1 sub-folder.",
);
```

### 5. Establish the state the test is asserting

One delete-folder test expected a nested file count, but the file was still at root. The assertion was wrong for the actual state.

Rule:

- before asserting summary text, first make the relevant state explicit in the test

Good:

```ts
await openFileActions(page, "tiny.pdf");
await page.getByRole("menuitem", { name: "Move" }).click();
await getFolderDestinationButton(page, "Documents").click();
await moveDialog.getByRole("button", { name: "Move files", exact: true }).click();
await expect(moveDialog).toBeHidden();
```

### 6. Wait for interactive controls before typing

Inline rename fields can be scheduled asynchronously after a menu action.

Rule:

- wait for the rename input to be visible, then assert the typed value before committing with `Enter`

Good:

```ts
const renameInput = page.getByLabel("Rename folder");
await expect(renameInput).toBeVisible();
await renameInput.fill("Archives");
await expect(renameInput).toHaveValue("Archives");
await renameInput.press("Enter");
```

### 7. Wait for confirm buttons to become enabled after selection

The move dialogs can briefly rerender after a destination is selected. During that transition, the confirm button may still be visible but temporarily disabled.

Rule:

- after selecting a destination in a move dialog, wait for the confirm button to be enabled before clicking it

Good:

```ts
async function confirmMoveDialog(
  dialog: ReturnType<Page["getByRole"]>,
  confirmLabel: "Move files" | "Move folder",
) {
  const confirmButton = dialog.getByRole("button", { name: confirmLabel, exact: true });
await expect(confirmButton).toBeEnabled();
await confirmButton.click();
}
```

Risky:

```ts
await moveDialog.getByRole("button", { name: "Move folder", exact: true }).click();
```

### 8. Wait for the destination selection state, not just the click

In move dialogs, clicking a destination button is not always enough synchronization by itself. The UI may update selection state asynchronously.

Rule:

- after clicking a destination, wait for that destination control to reflect the selected state before confirming
- for high-value flows that immediately act on newly created folders, it is also reasonable to verify the folders exist in backend state before starting the move

Good:

```ts
async function selectMoveDestination(
  dialog: ReturnType<Page["getByRole"]>,
  folderName: string,
) {
  const destinationButton = dialog.getByRole("button", { name: folderName, exact: true });
  await destinationButton.click();
  await expect(destinationButton).toHaveAttribute("data-variant", "default");
}
```

### 9. If a UI action stays flaky, move setup to the service layer and keep the browser assertion on the outcome

The folder-move dialog remained unstable even after waiting for selection state and enabled-state transitions. In that case, the better test split is:

- use service or API helpers to create the state transition
- reload the page
- assert the user-visible hierarchy or breadcrumb outcome in the browser

Rule:

- do not keep stacking more waits onto a flaky interaction when the real product check is the final visible state

Good:

```ts
await moveFolder(userId, projectsFolderId, archiveFolderId);
await page.goto("/files");
await page.reload();

await expect(getGridFolderButton(page, "Projects")).toHaveCount(0);
await getGridFolderButton(page, "Archive").click();
await expect(getGridFolderButton(page, "Projects")).toBeVisible();
```

### 10. When backend setup depends on freshly created records, retry with fresh IDs

Freshly created entities can still be awkward to use immediately in the same test step, especially if the setup path crosses UI state, server actions, and direct service calls.

Rule:

- if a lower-layer setup call still returns `not found`, retry the operation with freshly looked-up IDs instead of caching one early lookup forever

Good:

```ts
await expect
  .poll(async () => {
    const folderId = await getFolderIdForUser(userId, "Projects");
    const targetFolderId = await getFolderIdForUser(userId, "Archive");

    if (!folderId || !targetFolderId) {
      return "ids-missing";
    }

    try {
      await moveFolder(userId, folderId, targetFolderId);
      return "ok";
    } catch (error) {
      return error instanceof Error ? error.message : "move-failed";
    }
  })
  .toBe("ok");
```

### 11. Do not anchor E2E locators to exact utility-class strings

One upload smoke failure came from a helper that looked for a card ancestor using a very specific class fragment. The file was present, but the class list had changed enough that the helper no longer matched.

Rule:

- prefer accessible-role locators and stable structural anchors over exact utility-class strings
- if you must walk to an ancestor, match only a minimal, durable shape

Good:

```ts
function libraryRow(page: Page, fileName: string) {
  return page
    .getByRole("button", { name: fileName, exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}
```

Risky:

```ts
locator("xpath=ancestor::div[contains(@class,'rounded-lg border border-border p-4')][1]")
```

### 12. For this codebase, prefer stable test ids on repeated file and folder controls

We repeatedly hit ambiguity around:

- file name buttons vs action buttons
- folder name buttons vs action buttons
- upload queue rows vs library cards
- move destination buttons inside dialogs

Rule:

- when a control is part of a repeated list or card grid, add a stable `data-testid` and use it in Playwright
- keep role-based assertions for accessibility checks, but prefer test ids for selecting the exact repeated item to interact with

Examples:

```tsx
data-testid={`file-card-${file.id}`}
data-testid={`file-actions-${file.id}`}
data-testid={`folder-name-${folder.id}`}
data-testid={`move-destination-${folder.id}`}
```

Good:

```ts
page.locator(`[data-testid^="file-card-"][data-test-file-name="tiny.pdf"]`).first()
page.locator(`[data-testid^="folder-name-"][data-test-folder-name="Projects"]`).first()
```

### 12a. Namespace test ids by surface and role, not just by control label

One failure came from giving two different upload entry points effectively the same test hook shape. Even after moving away from role and label selectors, Playwright strict mode still failed because the test id itself was duplicated across surfaces.

Rule:

- include both the surface and the control role in the test id
- use container ids for major surfaces, then child ids for controls inside them
- avoid generic ids like `upload-trigger`, `search-input`, or `new-folder-button` when the page can render more than one of that control

Good:

```tsx
<div data-testid="files-library-toolbar">
  <input data-testid="files-library-toolbar-search-input" />
  <button data-testid="files-library-toolbar-upload-trigger" />
</div>
```

```ts
page
  .getByTestId("files-library-toolbar")
  .getByTestId("files-library-toolbar-upload-trigger")
  .click();
```

Risky:

```tsx
<button data-testid="files-upload-trigger" />
```

Reason:

- another upload trigger in a queue card, header, or mobile action bar will collide immediately
- strict mode failures here are a locator-design problem, not a Playwright problem

### 13. For inline rename fields opened from menus, prefer blur-based commit over Enter when focus is unstable

One folder-rename flow reopened the actions menu when the test pressed `Enter`. The rename input was created from an async menu action, and focus could bounce back to the menu trigger.

Rule:

- if inline rename supports both `Enter` and `blur`, prefer `blur` in E2E when the field was opened from a dropdown menu and `Enter` is flaky

Good:

```ts
const renameInput = page.getByLabel("Rename folder");
await expect(renameInput).toBeVisible();
await renameInput.fill("Archives");
await expect(renameInput).toHaveValue("Archives");
await renameInput.evaluate((element) => {
  (element as HTMLInputElement).blur();
});
```

### 14. Do not use a bare label locator when the same labeled input exists in multiple views

This app has `Rename folder` inputs in grid, list, and breadcrumbs. `getByLabel("Rename folder")` is accessible, but not specific enough for reliable E2E interaction.

Rule:

- if the same label appears in multiple contexts, add a scoped test id and target the intended instance directly

Good:

```ts
page.locator(`[data-testid^="rename-folder-"][data-test-folder-name="Projects"]`).first()
```

### 15. Use surface-specific helpers: grid/list locators are not breadcrumb locators

One folder hierarchy test failed because it reused the grid folder helper after navigation had moved the folder names into the breadcrumb.

Rule:

- create separate helpers for grid/list items and breadcrumb items
- after navigating into a folder, assert breadcrumbs with breadcrumb locators, not card locators

Good:

```ts
function getBreadcrumbFolderButton(page: Page, folderName: string) {
  return page.locator(`[data-testid^="breadcrumb-folder-"][data-test-folder-name="${folderName}"]`).first();
}
```

### 16. When a client workflow gains a new network handshake, update every mocked E2E contract for that workflow

The upload queue tests originally mocked:

- `/api/upload/init`
- `/api/upload/status`
- `/api/upload/chunk`
- `/api/upload/complete`

After global upload-slot coordination was added, the real client flow also called:

- `/api/upload/start`
- `/api/upload/release`

Older mocked specs did not intercept those new requests, so Playwright let them fall through to the real server. That produced confusing failures such as `400` responses from `/api/upload/start`, even though the rest of the upload flow was fully mocked.

Rule:

- when a browser workflow adds a new endpoint, treat that as a test-contract change, not just an implementation change
- update every mocked spec for that workflow in the same patch
- if the mocked spec uses fake IDs, make sure they still satisfy any new validation rules or intercept the validating endpoint directly

Good:

```ts
await page.route("**/api/upload/start", async (route) => {
  const body = route.request().postDataJSON() as { uploadId?: string };

  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      activeCount: 1,
      maxActiveUploads: 3,
      uploadId: body.uploadId ?? "upload-unknown",
    }),
  });
});

await page.route("**/api/upload/release", async (route) => {
  const body = route.request().postDataJSON() as { uploadId?: string };

  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      released: true,
      uploadId: body.uploadId ?? "upload-unknown",
    }),
  });
});
```

Risky:

```ts
// Only mocking the pre-existing upload endpoints after the client flow
// now depends on /api/upload/start and /api/upload/release.
await page.route("**/api/upload/init", ...);
await page.route("**/api/upload/status?*", ...);
await page.route("**/api/upload/chunk", ...);
await page.route("**/api/upload/complete", ...);
```

## Team Conventions For Future E2E Tests

- Prefer `getByRole`, `getByLabel`, and exact accessible names over CSS or text-only locators.
- Scope modal interactions to the modal container before clicking confirm buttons.
- When a dialog changes state after a selection, wait for the confirm button to be enabled before clicking it.
- When a dialog uses visual selection state, wait for that selected state before confirming.
- Use helper functions for repeated UI concepts like folder buttons, destination pickers, and upload dialog lifecycle.
- Avoid asserting on toast text unless the toast itself is the product requirement under test.
- If a test mixes modals and page actions, make modal open/close behavior explicit.
- If a UI interaction remains flaky after proper synchronization, move setup into a lower layer and keep the browser focused on the final user-visible result.
- If a failure mentions strict mode, assume the locator is ambiguous and tighten intent before adding waits.
- If a mocked workflow starts calling a new endpoint, update every existing route mock for that workflow before trusting the failure signal.

## Suggested Review Checklist

- Does the helper establish its own preconditions?
- Is the locator scoped tightly enough to survive strict mode?
- Is the assertion checking durable UI state rather than a transient notification?
- Does the locator use the actual ARIA role from the rendered UI?
- Could the control still be visible but temporarily disabled during a rerender?
- After a selection click, is there a concrete selected-state assertion before confirm?
- Does the test explicitly create the state it later asserts?
- Are we testing the user-visible outcome, or overfitting to a fragile interaction step?
