"use client";

import * as React from "react";
import { DownloadIcon, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type SharedDownloadButtonProps = {
  fileName?: string;
  href: string;
};

function getDownloadFilename(response: Response, fallbackName?: string) {
  const contentDisposition = response.headers.get("content-disposition");
  const utf8Match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition?.match(/filename="([^"]+)"/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return fallbackName ?? "download";
}

export function SharedDownloadButton({ fileName, href }: SharedDownloadButtonProps) {
  const [isPending, setIsPending] = React.useState(false);
  const objectUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  async function handleDownload() {
    if (isPending) {
      return;
    }

    setIsPending(true);

    try {
      const response = await fetch(href, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to download file");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = objectUrl;
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = getDownloadFilename(response, fileName);
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      window.requestAnimationFrame(() => {
        anchor.click();
        anchor.remove();
      });

      window.setTimeout(() => {
        if (objectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrlRef.current = null;
        }
      }, 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download file");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      disabled={isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleDownload();
      }}
      type="button"
    >
      {isPending ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <DownloadIcon className="mr-2 size-4" />}
      {isPending ? "Downloading..." : "Download"}
    </Button>
  );
}
