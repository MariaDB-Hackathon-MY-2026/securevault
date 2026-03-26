import { act, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Provider } from "@/app/providers";
import type { UploadJobSnapshot, UploadJobStatus } from "@/lib/upload/upload-job";

const uploadManagerMock = vi.hoisted(() => {
  type Snapshot = {
    uploads: UploadJobSnapshot[];
  };

  let snapshot: Snapshot = {
    uploads: [],
  };

  const listeners = new Set<(snapshot: Snapshot) => void>();

  const manager = {
    addFiles: vi.fn<(files: File[]) => void>(),
    pauseUpload: vi.fn<(id: string) => void>(),
    resumeUpload: vi.fn<(id: string) => void>(),
    cancelUpload: vi.fn<(id: string) => void>(),
    removeUpload: vi.fn<(id: string) => void>(),
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn((listener: (nextSnapshot: Snapshot) => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }),
  };

  const getInstance = vi.fn(() => manager);

  function setUploads(uploads: UploadJobSnapshot[]) {
    snapshot = { uploads };
  }

  function emit() {
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function listenerCount() {
    return listeners.size;
  }

  function reset() {
    snapshot = { uploads: [] };
    listeners.clear();
    manager.addFiles.mockReset();
    manager.pauseUpload.mockReset();
    manager.resumeUpload.mockReset();
    manager.cancelUpload.mockReset();
    manager.removeUpload.mockReset();
    manager.getSnapshot.mockClear();
    manager.subscribe.mockClear();
    getInstance.mockClear();
  }

  return {
    emit,
    getInstance,
    listenerCount,
    manager,
    reset,
    setUploads,
  };
});

vi.mock("@/lib/upload/upload-manager", () => ({
  UploadManager: {
    getInstance: uploadManagerMock.getInstance,
  },
}));

import { UploadQueueProvider } from "@/components/upload/upload-provider";
import { useUploadQueue } from "@/hooks/use-upload-queue";

function createFile(name: string) {
  return new File(["hello"], name, { type: "application/pdf" });
}

function createUploadSnapshot({
  completedChunkIndexes = [],
  error = null,
  file = createFile("report.pdf"),
  fileId = null,
  id = "job-1",
  progress = 0,
  status = "queued" as UploadJobStatus,
  uploadId = null,
}: Partial<UploadJobSnapshot> = {}): UploadJobSnapshot {
  return {
    completedChunkIndexes,
    error,
    file,
    fileId,
    id,
    progress,
    status,
    uploadId,
  };
}

function UploadSummary({ testId }: { testId: string }) {
  const { uploads } = useUploadQueue();

  return (
    <output data-testid={testId}>
      {uploads.map((upload) => `${upload.file.name}:${upload.status}`).join("|")}
    </output>
  );
}

function UploadCount({ testId }: { testId: string }) {
  const { uploads } = useUploadQueue();

  return <output data-testid={testId}>{String(uploads.length)}</output>;
}

function PauseButton({ id }: { id: string }) {
  const { pauseUpload } = useUploadQueue();

  return (
    <button onClick={() => pauseUpload(id)} type="button">
      Pause
    </button>
  );
}

function RemoveButton({ id }: { id: string }) {
  const { removeUpload } = useUploadQueue();

  return (
    <button onClick={() => removeUpload(id)} type="button">
      Remove
    </button>
  );
}

function ActionHarness() {
  const {
    addFiles,
    cancelUpload,
    pauseUpload,
    removeUpload,
    resumeUpload,
    uploads,
  } = useUploadQueue();
  const files = [createFile("queued-one.pdf"), createFile("queued-two.pdf")];
  const uploadId = uploads[0]?.id ?? "missing-job";

  return (
    <>
      <button onClick={() => addFiles(files)} type="button">
        Add
      </button>
      <button onClick={() => pauseUpload(uploadId)} type="button">
        Pause
      </button>
      <button onClick={() => resumeUpload(uploadId)} type="button">
        Resume
      </button>
      <button onClick={() => cancelUpload(uploadId)} type="button">
        Cancel
      </button>
      <button onClick={() => removeUpload(uploadId)} type="button">
        Remove
      </button>
    </>
  );
}

function HookOnlyConsumer() {
  useUploadQueue();

  return null;
}

function ActionIdentityProbe({
  onRender,
}: {
  onRender: (actions: {
    addFiles: ReturnType<typeof useUploadQueue>["addFiles"];
    pauseUpload: ReturnType<typeof useUploadQueue>["pauseUpload"];
    resumeUpload: ReturnType<typeof useUploadQueue>["resumeUpload"];
    cancelUpload: ReturnType<typeof useUploadQueue>["cancelUpload"];
    removeUpload: ReturnType<typeof useUploadQueue>["removeUpload"];
  }) => void;
}) {
  const {
    addFiles,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    removeUpload,
    uploads,
  } = useUploadQueue();

  React.useEffect(() => {
    onRender({
      addFiles,
      pauseUpload,
      resumeUpload,
      cancelUpload,
      removeUpload,
    });
  });

  return <output data-testid="action-probe-count">{uploads.length}</output>;
}

describe("UploadQueueProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadManagerMock.reset();
  });

  it("renders the manager snapshot immediately, shares it across consumers, and subscribes once per provider", () => {
    uploadManagerMock.setUploads([
      createUploadSnapshot({
        file: createFile("alpha.pdf"),
        status: "uploading",
      }),
      createUploadSnapshot({
        file: createFile("beta.pdf"),
        id: "job-2",
        progress: 100,
        status: "success",
      }),
    ]);

    render(
      <UploadQueueProvider>
        <UploadSummary testId="summary-a" />
        <UploadSummary testId="summary-b" />
        <UploadCount testId="count" />
      </UploadQueueProvider>,
    );

    expect(screen.getByTestId("summary-a").textContent).toBe(
      "alpha.pdf:uploading|beta.pdf:success",
    );
    expect(screen.getByTestId("summary-b").textContent).toBe(
      "alpha.pdf:uploading|beta.pdf:success",
    );
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(uploadManagerMock.getInstance).toHaveBeenCalledTimes(1);
    expect(uploadManagerMock.manager.subscribe).toHaveBeenCalledTimes(1);
    expect(uploadManagerMock.listenerCount()).toBe(1);
  });

  it("reflects manager updates in every consumer when an action from one component changes the queue", () => {
    uploadManagerMock.setUploads([
      createUploadSnapshot({
        file: createFile("report.pdf"),
        id: "job-1",
        status: "uploading",
      }),
    ]);
    uploadManagerMock.manager.pauseUpload.mockImplementation((id: string) => {
      uploadManagerMock.setUploads([
        createUploadSnapshot({
          file: createFile("report.pdf"),
          id,
          progress: 50,
          status: "paused",
        }),
      ]);
      uploadManagerMock.emit();
    });

    render(
      <UploadQueueProvider>
        <PauseButton id="job-1" />
        <UploadSummary testId="summary-a" />
        <UploadSummary testId="summary-b" />
      </UploadQueueProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(uploadManagerMock.manager.pauseUpload).toHaveBeenCalledWith("job-1");
    expect(screen.getByTestId("summary-a").textContent).toBe("report.pdf:paused");
    expect(screen.getByTestId("summary-b").textContent).toBe("report.pdf:paused");
  });

  it("delegates the public queue actions to the singleton manager without creating React-owned queue state", () => {
    uploadManagerMock.setUploads([
      createUploadSnapshot({
        file: createFile("existing.pdf"),
        id: "job-9",
        status: "queued",
      }),
    ]);

    render(
      <UploadQueueProvider>
        <ActionHarness />
        <UploadCount testId="count" />
      </UploadQueueProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(uploadManagerMock.manager.addFiles).toHaveBeenCalledTimes(1);
    expect(uploadManagerMock.manager.addFiles.mock.calls[0]?.[0].map((file) => file.name)).toEqual([
      "queued-one.pdf",
      "queued-two.pdf",
    ]);
    expect(uploadManagerMock.manager.pauseUpload).toHaveBeenCalledWith("job-9");
    expect(uploadManagerMock.manager.resumeUpload).toHaveBeenCalledWith("job-9");
    expect(uploadManagerMock.manager.cancelUpload).toHaveBeenCalledWith("job-9");
    expect(uploadManagerMock.manager.removeUpload).toHaveBeenCalledWith("job-9");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("keeps active uploads visible when remove is rejected by the manager", () => {
    uploadManagerMock.setUploads([
      createUploadSnapshot({
        file: createFile("live.pdf"),
        id: "job-1",
        progress: 25,
        status: "uploading",
      }),
    ]);

    render(
      <UploadQueueProvider>
        <RemoveButton id="job-1" />
        <UploadSummary testId="summary" />
      </UploadQueueProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(uploadManagerMock.manager.removeUpload).toHaveBeenCalledWith("job-1");
    expect(screen.getByTestId("summary").textContent).toBe("live.pdf:uploading");
  });

  it("reflects terminal removals across consumers when the manager publishes the new snapshot", () => {
    uploadManagerMock.setUploads([
      createUploadSnapshot({
        file: createFile("done.pdf"),
        id: "job-1",
        progress: 100,
        status: "success",
      }),
    ]);
    uploadManagerMock.manager.removeUpload.mockImplementation(() => {
      uploadManagerMock.setUploads([]);
      uploadManagerMock.emit();
    });

    render(
      <UploadQueueProvider>
        <RemoveButton id="job-1" />
        <UploadCount testId="count-a" />
        <UploadCount testId="count-b" />
      </UploadQueueProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByTestId("count-a").textContent).toBe("0");
    expect(screen.getByTestId("count-b").textContent).toBe("0");
  });

  it("converges to the latest snapshot after rapid successive manager notifications", () => {
    render(
      <UploadQueueProvider>
        <UploadSummary testId="summary" />
        <UploadCount testId="count" />
      </UploadQueueProvider>,
    );

    act(() => {
      uploadManagerMock.setUploads([
        createUploadSnapshot({
          file: createFile("first.pdf"),
          id: "job-1",
          status: "queued",
        }),
      ]);
      uploadManagerMock.emit();

      uploadManagerMock.setUploads([
        createUploadSnapshot({
          file: createFile("first.pdf"),
          id: "job-1",
          status: "success",
        }),
        createUploadSnapshot({
          file: createFile("second.pdf"),
          id: "job-2",
          status: "queued",
        }),
      ]);
      uploadManagerMock.emit();

      uploadManagerMock.setUploads([
        createUploadSnapshot({
          file: createFile("second.pdf"),
          id: "job-2",
          progress: 50,
          status: "paused",
        }),
      ]);
      uploadManagerMock.emit();
    });

    expect(screen.getByTestId("summary").textContent).toBe("second.pdf:paused");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("unsubscribes on unmount and ignores later manager notifications without React warnings", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { unmount } = render(
      <UploadQueueProvider>
        <UploadCount testId="count" />
      </UploadQueueProvider>,
    );

    expect(uploadManagerMock.listenerCount()).toBe(1);

    unmount();

    expect(uploadManagerMock.listenerCount()).toBe(0);

    act(() => {
      uploadManagerMock.setUploads([
        createUploadSnapshot({
          file: createFile("late.pdf"),
          id: "job-late",
          status: "queued",
        }),
      ]);
      uploadManagerMock.emit();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("throws a descriptive error when the hook is used outside the provider", () => {
    expect(() => render(<HookOnlyConsumer />)).toThrow(
      "useUploadQueue must be used within an UploadQueueProvider",
    );
  });

  it("wires the upload queue through the app-level Provider", () => {
    uploadManagerMock.setUploads([
      createUploadSnapshot({
        file: createFile("root-provider.pdf"),
        id: "job-root",
        status: "uploading",
      }),
    ]);

    render(
      <Provider>
        <UploadSummary testId="summary" />
      </Provider>,
    );

    expect(screen.getByTestId("summary").textContent).toBe("root-provider.pdf:uploading");
    expect(uploadManagerMock.listenerCount()).toBe(1);
  });

  it("does not leak subscriptions across strict mode remount cycles", () => {
    const { unmount } = render(
      <React.StrictMode>
        <UploadQueueProvider>
          <UploadCount testId="count" />
        </UploadQueueProvider>
      </React.StrictMode>,
    );

    expect(uploadManagerMock.listenerCount()).toBe(1);

    unmount();

    expect(uploadManagerMock.listenerCount()).toBe(0);
  });

  it("treats missing-id actions as manager-driven no-ops and keeps the queue stable", () => {
    render(
      <UploadQueueProvider>
        <ActionHarness />
        <UploadCount testId="count" />
      </UploadQueueProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(uploadManagerMock.manager.pauseUpload).toHaveBeenCalledWith("missing-job");
    expect(uploadManagerMock.manager.resumeUpload).toHaveBeenCalledWith("missing-job");
    expect(uploadManagerMock.manager.cancelUpload).toHaveBeenCalledWith("missing-job");
    expect(uploadManagerMock.manager.removeUpload).toHaveBeenCalledWith("missing-job");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("keeps action references stable across queue snapshot updates", () => {
    const actionSnapshots: Array<{
      addFiles: ReturnType<typeof useUploadQueue>["addFiles"];
      pauseUpload: ReturnType<typeof useUploadQueue>["pauseUpload"];
      resumeUpload: ReturnType<typeof useUploadQueue>["resumeUpload"];
      cancelUpload: ReturnType<typeof useUploadQueue>["cancelUpload"];
      removeUpload: ReturnType<typeof useUploadQueue>["removeUpload"];
    }> = [];
    const handleRender = vi.fn((actions: (typeof actionSnapshots)[number]) => {
      actionSnapshots.push(actions);
    });

    render(
      <UploadQueueProvider>
        <ActionIdentityProbe onRender={handleRender} />
      </UploadQueueProvider>,
    );

    act(() => {
      uploadManagerMock.setUploads([
        createUploadSnapshot({
          file: createFile("stable-actions.pdf"),
          id: "job-stable",
          progress: 50,
          status: "paused",
        }),
      ]);
      uploadManagerMock.emit();
    });

    expect(handleRender).toHaveBeenCalledTimes(2);
    expect(actionSnapshots[1]?.addFiles).toBe(actionSnapshots[0]?.addFiles);
    expect(actionSnapshots[1]?.pauseUpload).toBe(actionSnapshots[0]?.pauseUpload);
    expect(actionSnapshots[1]?.resumeUpload).toBe(actionSnapshots[0]?.resumeUpload);
    expect(actionSnapshots[1]?.cancelUpload).toBe(actionSnapshots[0]?.cancelUpload);
    expect(actionSnapshots[1]?.removeUpload).toBe(actionSnapshots[0]?.removeUpload);
  });

  it("keeps separate provider subtrees synchronized through the same singleton manager", () => {
    uploadManagerMock.setUploads([
      createUploadSnapshot({
        file: createFile("shared.pdf"),
        id: "job-shared",
        status: "queued",
      }),
    ]);

    render(
      <>
        <UploadQueueProvider>
          <UploadSummary testId="summary-a" />
        </UploadQueueProvider>
        <UploadQueueProvider>
          <UploadSummary testId="summary-b" />
        </UploadQueueProvider>
      </>,
    );

    expect(screen.getByTestId("summary-a").textContent).toBe("shared.pdf:queued");
    expect(screen.getByTestId("summary-b").textContent).toBe("shared.pdf:queued");
    expect(uploadManagerMock.listenerCount()).toBe(2);

    act(() => {
      uploadManagerMock.setUploads([
        createUploadSnapshot({
          file: createFile("shared.pdf"),
          id: "job-shared",
          progress: 100,
          status: "success",
        }),
      ]);
      uploadManagerMock.emit();
    });

    expect(screen.getByTestId("summary-a").textContent).toBe("shared.pdf:success");
    expect(screen.getByTestId("summary-b").textContent).toBe("shared.pdf:success");
  });
});

