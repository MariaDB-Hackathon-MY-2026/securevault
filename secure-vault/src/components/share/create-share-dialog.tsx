"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createShareLinkAction } from "@/app/(dashboard)/files/share-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { toast } from "sonner";
import { ShareLinksList, type ShareLinksListItem } from "./share-links-list";

type CreateShareDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "file" | "folder";
  targetId: string;
  targetName: string;
};

export function CreateShareDialog({
  isOpen,
  onOpenChange,
  targetType,
  targetId,
  targetName,
}: CreateShareDialogProps) {
  const queryClient = useQueryClient();
  const [expiry, setExpiry] = React.useState<string>("never");
  const [maxDownloads, setMaxDownloads] = React.useState<string>("");
  const [allowedEmails, setAllowedEmails] = React.useState<string>("");

  const queryKey = ["shareLinks", targetType, targetId];

  const { data: links = [], isLoading } = useQuery<ShareLinksListItem[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/share/links?${targetType}Id=${targetId}`);
      if (!res.ok) throw new Error("Failed to fetch links");
      return res.json();
    },
    enabled: isOpen,
  });

  const generateLink = useMutation({
    mutationFn: async () => {
      let expiresAt: Date | null = null;
      if (expiry !== "never") {
        expiresAt = new Date();
        if (expiry === "1h") expiresAt.setHours(expiresAt.getHours() + 1);
        if (expiry === "24h") expiresAt.setHours(expiresAt.getHours() + 24);
        if (expiry === "7d") expiresAt.setDate(expiresAt.getDate() + 7);
        if (expiry === "30d") expiresAt.setDate(expiresAt.getDate() + 30);
      }

      const emails = allowedEmails
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      const parsedDownloads = parseInt(maxDownloads, 10);
      const limit = isNaN(parsedDownloads) || parsedDownloads <= 0 ? null : parsedDownloads;

      const res = await createShareLinkAction({
        [targetType + "Id"]: targetId,
        expiresAt,
        maxDownloads: limit,
        allowedEmails: emails,
      });

      if (!res.success) throw new Error("Failed to create share link");
      return res.link;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Share link created");
      setExpiry("never");
      setMaxDownloads("");
      setAllowedEmails("");
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle>Share {targetType === "file" ? "File" : "Folder"}</DialogTitle>
          <DialogDescription>
            Share "{targetName}" with others.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="expiry">Expiry</Label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="1h">1 Hour</option>
              <option value="24h">24 Hours</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="never">Never</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxDownloads">Max Downloads</Label>
            <Input
              id="maxDownloads"
              placeholder="Leave empty for unlimited"
              type="number"
              min="1"
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This limit applies to the link as a whole, not per visitor or per email.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emails">Allowed Emails</Label>
            <Input
              id="emails"
              placeholder="comma separated (leave empty for public link)"
              value={allowedEmails}
              onChange={(e) => setAllowedEmails(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to create a public link. Add comma-separated emails to require OTP verification.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => generateLink.mutate()} disabled={generateLink.isPending}>
              {generateLink.isPending ? "Generating..." : "Generate Link"}
            </Button>
          </div>

          <div className="mt-4 border-t pt-4">
            <h4 className="mb-2 font-medium">Existing Links</h4>
            <ShareLinksList
              links={links}
              isLoading={isLoading}
              onRevoke={() => queryClient.invalidateQueries({ queryKey })}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
