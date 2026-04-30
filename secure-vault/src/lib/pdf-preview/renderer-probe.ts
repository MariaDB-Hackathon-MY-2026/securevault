import "server-only";

import { spawn } from "node:child_process";

import { getSharedPdfPreviewConfig } from "@/lib/pdf-preview/config";
import { PdfPreviewError } from "@/lib/pdf-preview/errors";

let probePromise: Promise<void> | null = null;
let rendererAvailable = false;

export async function assertPdfRendererAvailable(): Promise<void> {
  if (rendererAvailable) {
    return;
  }

  if (probePromise) {
    return probePromise;
  }

  const { rendererPath } = getSharedPdfPreviewConfig();

  probePromise = new Promise<void>((resolve, reject) => {
    const child = spawn(rendererPath, ["-v"], {
      stdio: "ignore",
    });

    child.once("error", (error) => {
      probePromise = null;
      reject(
        new PdfPreviewError(
          "RENDERER_UNAVAILABLE",
          "PDF image preview renderer is unavailable",
          { cause: error },
        ),
      );
    });

    child.once("exit", (code) => {
      if (code === 0) {
        rendererAvailable = true;
        resolve();
        return;
      }

      probePromise = null;
      reject(
        new PdfPreviewError(
          "RENDERER_UNAVAILABLE",
          "PDF image preview renderer is unavailable",
        ),
      );
    });
  });

  return probePromise;
}

export function resetPdfRendererProbeForTests() {
  probePromise = null;
  rendererAvailable = false;
}
