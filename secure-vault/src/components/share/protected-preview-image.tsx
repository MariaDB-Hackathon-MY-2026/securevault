"use client";

import { useEffect, useRef, useState } from "react";

import type { CSSProperties } from "react";

type ProtectedPreviewImageProps = {
  alt: string;
  className?: string;
  imageClassName?: string;
  onError?: () => void;
  onLoad?: () => void;
  src: string;
  style?: CSSProperties;
  testId?: string;
};

type PreviewImageState = {
  objectUrl: string | null;
  src: string;
  status: "loading" | "ready" | "error";
};

export function ProtectedPreviewImage({
  alt,
  className,
  imageClassName,
  onError,
  onLoad,
  src,
  style,
  testId,
}: ProtectedPreviewImageProps) {
  const onErrorRef = useRef(onError);
  const onLoadRef = useRef(onLoad);
  const [imageState, setImageState] = useState<PreviewImageState>({
    objectUrl: null,
    src,
    status: "loading",
  });
  const isReady = imageState.src === src && imageState.status === "ready" && imageState.objectUrl;
  const hasFailed = imageState.src === src && imageState.status === "error";

  useEffect(() => {
    onErrorRef.current = onError;
    onLoadRef.current = onLoad;
  }, [onError, onLoad]);

  useEffect(() => {
    const abortController = new AbortController();

    void fetch(src, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const objectUrl = URL.createObjectURL(await response.blob());

        if (abortController.signal.aborted) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setImageState({ objectUrl, src, status: "ready" });
        onLoadRef.current?.();
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }

        setImageState({ objectUrl: null, src, status: "error" });
        onErrorRef.current?.();
      });

    return () => {
      abortController.abort();
    };
  }, [src]);

  useEffect(() => {
    const objectUrl = imageState.objectUrl;

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageState.objectUrl]);

  return (
    <div
      aria-label={alt}
      className={className}
      data-load-state={hasFailed ? "error" : isReady ? "ready" : "loading"}
      data-testid={testId}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      role="img"
      style={style}
    >
      <div
        aria-hidden="true"
        className={imageClassName}
        style={{
          backgroundImage: isReady ? `url("${imageState.objectUrl}")` : undefined,
        }}
      />
    </div>
  );
}
