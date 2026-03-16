import { RiCheckboxCircleLine, RiErrorWarningLine } from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type EmailVerificationStatusProps = {
  verified: boolean;
  variant?: "badge" | "notice";
  className?: string;
};

export function EmailVerificationStatus({
  verified,
  variant = "badge",
  className,
}: EmailVerificationStatusProps) {
  if (variant === "notice") {
    return verified ? (
      <div
        className={cn(
          "flex items-start gap-3 border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm",
          className,
        )}
      >
        <RiCheckboxCircleLine className="mt-0.5 size-5 text-emerald-600" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Email verified</p>
          <p className="text-muted-foreground">
            Your account is cleared for protected file and sharing features.
          </p>
        </div>
      </div>
    ) : (
      <div
        className={cn(
          "flex items-start gap-3 border border-amber-500/60 bg-amber-500/10 p-4 text-sm shadow-sm shadow-amber-500/10",
          className,
        )}
      >
        <RiErrorWarningLine className="mt-0.5 size-5 text-amber-600" />
        <div className="space-y-1">
          <p className="font-medium text-amber-950">Email verification pending</p>
          <p className="text-amber-900/80">
            Upload, sharing, and AI features stay blocked until the email verification flow is
            completed.
          </p>
        </div>
      </div>
    );
  }

  return verified ? (
    <Badge className={cn("gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600", className)}>
      <RiCheckboxCircleLine className="size-3.5" />
      Email verified
    </Badge>
  ) : (
    <Badge
      className={cn(
        "gap-2 border-amber-500/80 bg-amber-400/15 px-3 py-1 text-amber-900 shadow-sm shadow-amber-500/10 hover:bg-amber-400/15",
        className,
      )}
      variant="outline"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-2 animate-ping rounded-full bg-amber-500/70" />
        <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
      </span>
      Email verification pending
    </Badge>
  );
}
