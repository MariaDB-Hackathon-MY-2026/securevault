"use client";

import { useActionState, useEffect, useRef } from "react";
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
