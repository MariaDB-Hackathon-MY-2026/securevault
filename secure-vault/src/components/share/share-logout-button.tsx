"use client";

import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ShareLogoutButton({ token }: { token: string }) {
  async function handleLogout() {
    try {
      const response = await fetch(`/api/share/${token}/logout`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to sign out from this link");
      }

      window.location.assign(`/s/${token}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign out from this link");
    }
  }

  return (
    <Button onClick={() => void handleLogout()} size="sm" type="button" variant="ghost">
      <LogOut className="mr-2 size-4" />
      Sign out
    </Button>
  );
}
