"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/use-action-toast";
import { currentUserQueryKey, type CurrentUserClient } from "@/lib/auth/current-user-client";
import {
  changePasswordAction,
  updateProfileAction,
  type SettingsActionState,
} from "@/app/(dashboard)/actions";
import {
  readFilenameSearchPreference,
  writeFilenameSearchPreference,
} from "@/lib/search/search-preferences";

const initialState: SettingsActionState | undefined = undefined;

type ProfileSettingsFormProps = {
  currentName: string;
};

export function ProfileSettingsForm({ currentName }: ProfileSettingsFormProps) {
  const queryClient = useQueryClient();
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  useActionToast(isPending, state, {
    loadingMessage: "Saving profile...",
    successMessage: "Profile updated successfully.",
    id: "settings-profile-toast",
  });

  useEffect(() => {
    if (state?.success && state.updatedName) {
      queryClient.setQueryData<CurrentUserClient | null>(currentUserQueryKey, (currentUser) => {
        if (!currentUser) {
          return currentUser;
        }

        return {
          ...currentUser,
          name: state.updatedName ?? currentUser.name,
        };
      });
    }
  }, [queryClient, state]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" name="name" defaultValue={currentName} maxLength={50} required />
      </div>
      <Button type="submit" className="w-fit" disabled={isPending}>
        {isPending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}

export function PasswordSettingsForm() {
  const passwordFormRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(changePasswordAction, initialState);

  useActionToast(isPending, state, {
    loadingMessage: "Updating password...",
    successMessage: "Password updated successfully.",
    id: "settings-password-toast",
  });

  useEffect(() => {
    if (state?.success) {
      passwordFormRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={passwordFormRef} action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" required />
      </div>
      <Button type="submit" className="w-fit" disabled={isPending}>
        {isPending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}

export function SearchSettingsForm() {
  const [filenameSearchEnabled, setFilenameSearchEnabled] = useState(() =>
    readFilenameSearchPreference(),
  );

  function handleFilenameSearchChange(enabled: boolean) {
    setFilenameSearchEnabled(enabled);
    writeFilenameSearchPreference(enabled);
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <p className="text-sm font-medium">Search behavior</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          The files page search bar uses smart matching by default. Turn on exact filename matching below if you want search to focus on file names only.
        </p>
      </div>

      <button
        aria-checked={filenameSearchEnabled}
        aria-describedby="filename-search-description filename-search-storage-note"
        className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/70 bg-background px-4 py-4 text-left transition-colors hover:border-foreground/20 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        id="filename-search-enabled"
        onClick={() => handleFilenameSearchChange(!filenameSearchEnabled)}
        role="switch"
        type="button"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="cursor-pointer text-sm font-medium" htmlFor="filename-search-enabled">
              Use exact filename matching
            </Label>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {filenameSearchEnabled ? "On" : "Off"}
            </span>
          </div>
          <p
            className="text-sm leading-6 text-muted-foreground"
            id="filename-search-description"
          >
            When this is on, the files search bar looks for exact file names like &quot;invoice-march.pdf&quot; instead of using broader matching.
          </p>
          <p
            className="text-xs leading-5 text-muted-foreground"
            id="filename-search-storage-note"
          >
            This preference is stored in this browser only.
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors ${
            filenameSearchEnabled
              ? "border-foreground bg-foreground"
              : "border-border bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-background shadow-sm transition-transform ${
              filenameSearchEnabled ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
