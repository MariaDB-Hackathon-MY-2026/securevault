import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  SharedPdfImagePreview: vi.fn(
    ({ fileId, fileName, token }: { fileId?: string; fileName?: string; token: string }) => (
      <div
        data-file-id={fileId}
        data-file-name={fileName}
        data-testid="shared-pdf-preview"
        data-token={token}
      />
    ),
  ),
}));

vi.mock("@/components/share/shared-download-button", () => ({
  SharedDownloadButton: ({ href }: { href: string }) => <a href={href}>Download</a>,
}));

vi.mock("@/components/share/share-logout-button", () => ({
  ShareLogoutButton: ({ token }: { token: string }) => <button type="button">Logout {token}</button>,
}));

vi.mock("@/components/share/shared-pdf-image-preview", () => ({
  SharedPdfImagePreview: mocks.SharedPdfImagePreview,
}));

import { SharedFileView } from "@/components/share/shared-file-view";

describe("SharedFileView", () => {
  it("renders the shared pdf image preview instead of an iframe for pdf files", () => {
    render(
      <SharedFileView
        email={null}
        fileId="file-1"
        fileName="report.pdf"
        mimeType="application/pdf"
        token="share-token"
      />,
    );

    expect(screen.getByTestId("shared-pdf-preview")).toBeTruthy();
    expect(screen.queryByTestId("shared-preview-frame")).toBeNull();
  });

  it("keeps the image preview path unchanged for images", () => {
    render(
      <SharedFileView
        email={null}
        fileId="file-1"
        fileName="photo.png"
        mimeType="image/png"
        token="share-token"
      />,
    );

    expect(screen.getByTestId("shared-preview-image").getAttribute("src")).toBe(
      "/api/share/share-token/preview?fileId=file-1",
    );
  });

  it("keeps the unsupported file fallback unchanged", () => {
    render(
      <SharedFileView
        email={null}
        fileId="file-1"
        fileName="archive.bin"
        mimeType="application/octet-stream"
        token="share-token"
      />,
    );

    expect(
      screen.getByText("Preview is not supported for this file type. Use download instead."),
    ).toBeTruthy();
  });
});
