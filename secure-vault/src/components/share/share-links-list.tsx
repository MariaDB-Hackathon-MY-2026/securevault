"use client";

import * as React from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";

import {
  revokeShareLinkAction,
  updateShareLinkSettingsAction,
} from "@/app/(dashboard)/files/share-actions";
import { formatExplorerDate } from "@/components/files/file-browser-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export type ShareLinksListItem = {
  allowedEmails: string[];
  created_at: string;
  download_count: number;
  expires_at: string | null;
  id: string;
  is_public: boolean;
  max_downloads: number | null;
  token: string;
};

export function ShareLinksList({
  isLoading,
  links,
  onRevoke,
}: {
  isLoading: boolean;
  links: ShareLinksListItem[];
  onRevoke: () => void;
}) {
  const [editingLinkId, setEditingLinkId] = React.useState<string | null>(null);
  const [emailDraft, setEmailDraft] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [maxDownloadsDraft, setMaxDownloadsDraft] = React.useState("");
  const [savingLinkId, setSavingLinkId] = React.useState<string | null>(null);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (links.length === 0) {
    return <div className="text-sm text-muted-foreground">No active share links.</div>;
  }

  function renderDownloadSummary(link: ShareLinksListItem) {
    if (link.max_downloads === null) {
      return `Downloads used: ${link.download_count} (unlimited)`;
    }

    if (link.download_count >= link.max_downloads) {
      return `Download limit reached: ${link.download_count} used of ${link.max_downloads}`;
    }

    return `Downloads used: ${link.download_count} of ${link.max_downloads}`;
  }

  async function handleRevoke(id: string) {
    try {
      const response = await revokeShareLinkAction(id);

      if (!response.success) {
        throw new Error("Failed to revoke link");
      }

      toast.success("Link revoked");
      onRevoke();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke link");
    }
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  async function handleSaveSettings(link: ShareLinksListItem) {
    setFormError(null);
    setSavingLinkId(link.id);

    try {
      const parsedLimit = Number.parseInt(maxDownloadsDraft, 10);
      const maxDownloads =
        maxDownloadsDraft.trim() === "" || Number.isNaN(parsedLimit) || parsedLimit <= 0
          ? null
          : parsedLimit;

      const response = await updateShareLinkSettingsAction({
        allowedEmails: emailDraft.split(",").map((email) => email.trim()).filter(Boolean),
        linkId: link.id,
        maxDownloads,
      });

      if (!response.success) {
        throw new Error("Failed to update link settings");
      }

      toast.success("Link settings updated");
      setEditingLinkId(null);
      setEmailDraft("");
      setMaxDownloadsDraft("");
      onRevoke();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update link settings";
      setFormError(message);
      toast.error(message);
    } finally {
      setSavingLinkId(null);
    }
  }

  return (
    <div className="max-h-60 space-y-3 overflow-y-auto">
      {links.map((link) => (
        <div
          className="rounded-md border p-3 text-sm"
          data-testid={`share-link-row-${link.id}`}
          data-test-share-token={link.token}
          key={link.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center space-x-2">
                <span className="truncate font-medium">/s/{link.token}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    link.is_public
                      ? "bg-green-100 text-green-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {link.is_public ? "Public" : "Restricted"}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Created: {formatExplorerDate(link.created_at)}
                <br />
                Expires: {link.expires_at ? formatExplorerDate(link.expires_at) : "Never"}
                <span> &bull; {renderDownloadSummary(link)}</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {link.allowedEmails.length > 0
                  ? `Allowed emails: ${link.allowedEmails.join(", ")}`
                  : "Allowed emails: Public link"}
              </div>
            </div>
            <div className="flex shrink-0 space-x-1">
              <Button
                className="hover:text-foreground"
                data-testid={`share-link-copy-${link.id}`}
                onClick={() => void handleCopy(link.token)}
                size="icon-sm"
                title="Copy Link"
                variant="ghost"
              >
                <Copy className="size-4" />
              </Button>
              <Button
                className="hover:text-foreground"
                data-testid={`share-link-edit-${link.id}`}
                onClick={() => {
                  setEditingLinkId(link.id);
                  setEmailDraft(link.allowedEmails.join(", "));
                  setFormError(null);
                  setMaxDownloadsDraft(link.max_downloads?.toString() ?? "");
                }}
                size="icon-sm"
                title="Edit Link Settings"
                variant="ghost"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                className="text-destructive hover:text-destructive"
                data-testid={`share-link-revoke-${link.id}`}
                onClick={() => void handleRevoke(link.id)}
                size="icon-sm"
                title="Revoke Link"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          {editingLinkId === link.id ? (
            <div className="mt-3 space-y-2 border-t pt-3">
              <label className="text-xs font-medium text-foreground" htmlFor={`emails-${link.id}`}>
                Allowed emails
              </label>
              <Input
                id={`emails-${link.id}`}
                onChange={(event) => {
                  setEmailDraft(event.target.value);
                  if (formError) {
                    setFormError(null);
                  }
                }}
                placeholder="comma separated emails, leave empty to make public"
                value={emailDraft}
              />
              <label className="text-xs font-medium text-foreground" htmlFor={`downloads-${link.id}`}>
                Max downloads
              </label>
              <Input
                id={`downloads-${link.id}`}
                min="1"
                onChange={(event) => {
                  setMaxDownloadsDraft(event.target.value);
                  if (formError) {
                    setFormError(null);
                  }
                }}
                placeholder="Leave empty for unlimited"
                type="number"
                value={maxDownloadsDraft}
              />
              {formError ? (
                <p
                  className="text-xs text-destructive"
                  data-testid={`share-link-error-${link.id}`}
                  role="alert"
                >
                  {formError}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Expiry cannot be changed after creation. Leave max downloads empty for unlimited.
                The download limit applies to the whole link, not per visitor or per email. You also cannot set it below the number of downloads already used.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setEditingLinkId(null);
                    setEmailDraft("");
                    setFormError(null);
                    setMaxDownloadsDraft("");
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  data-testid={`share-link-save-${link.id}`}
                  disabled={savingLinkId === link.id}
                  onClick={() => void handleSaveSettings(link)}
                  size="sm"
                  type="button"
                >
                  {savingLinkId === link.id ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
