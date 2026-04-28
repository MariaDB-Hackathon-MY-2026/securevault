import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SharedInspectionDeterrent } from "@/components/share/shared-inspection-deterrent";

describe("SharedInspectionDeterrent", () => {
  it.each([
    ["F12", { key: "F12" }],
    ["Ctrl+Shift+I", { ctrlKey: true, key: "I", shiftKey: true }],
    ["Meta+Shift+C", { key: "C", metaKey: true, shiftKey: true }],
    ["Ctrl+Shift+J", { ctrlKey: true, key: "J", shiftKey: true }],
    ["Ctrl+U", { ctrlKey: true, key: "U" }],
    ["Ctrl+S", { ctrlKey: true, key: "S" }],
  ])("blocks %s on shared pages", (_label, eventInit) => {
    render(<SharedInspectionDeterrent />);

    expect(fireEvent.keyDown(document, eventInit)).toBe(false);
  });

  it("blocks the page context menu", () => {
    render(<SharedInspectionDeterrent />);

    expect(fireEvent.contextMenu(document)).toBe(false);
  });

  it("does not block regular keyboard input", () => {
    render(<SharedInspectionDeterrent />);

    expect(fireEvent.keyDown(document, { key: "A" })).toBe(true);
    expect(fireEvent.keyDown(document, { ctrlKey: true, key: "C" })).toBe(true);
  });
});
