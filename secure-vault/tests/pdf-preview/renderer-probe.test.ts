import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  __esModule: true,
  default: {
    spawn: spawnMock,
  },
  spawn: spawnMock,
}));

import {
  assertPdfRendererAvailable,
  resetPdfRendererProbeForTests,
} from "@/lib/pdf-preview/renderer-probe";
import { PdfPreviewError } from "@/lib/pdf-preview/errors";

function createChildProcess() {
  const emitter = new EventEmitter() as EventEmitter & {
    once: EventEmitter["once"];
  };

  return emitter;
}

describe("pdf renderer probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPdfRendererProbeForTests();
  });

  it("accepts an available renderer", async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const probePromise = assertPdfRendererAvailable();
    child.emit("exit", 0);

    await expect(probePromise).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledWith("pdftocairo", ["-v"], { stdio: "ignore" });
  });

  it("maps a missing executable to renderer unavailable", async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const probePromise = assertPdfRendererAvailable();
    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

    await expect(probePromise).rejects.toThrowError(
      new PdfPreviewError(
        "RENDERER_UNAVAILABLE",
        "PDF image preview renderer is unavailable",
      ),
    );
  });

  it("maps non-zero exit codes to renderer unavailable", async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const probePromise = assertPdfRendererAvailable();
    child.emit("exit", 1);

    await expect(probePromise).rejects.toThrowError(
      new PdfPreviewError(
        "RENDERER_UNAVAILABLE",
        "PDF image preview renderer is unavailable",
      ),
    );
  });

  it("caches a successful probe", async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const firstProbe = assertPdfRendererAvailable();
    child.emit("exit", 0);
    await firstProbe;
    await assertPdfRendererAvailable();

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
