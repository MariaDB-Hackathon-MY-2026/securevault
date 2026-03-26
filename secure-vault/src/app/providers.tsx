"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { UploadQueueProvider } from "@/components/upload/upload-provider";

export function Provider({ children }: React.PropsWithChildren) {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <UploadQueueProvider>{children}</UploadQueueProvider>
    </QueryClientProvider>
  );
}
