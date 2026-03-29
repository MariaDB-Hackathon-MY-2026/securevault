import { RiCheckboxCircleLine } from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { StatusNotice } from "@/components/ui/status-notice";
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
      <StatusNotice
        tone="success"
        title="Email verified"
        description="Your account is cleared for protected file and sharing features."
        className={className}
      />
    ) : (
      <StatusNotice
        tone="warning"
        title="Email verification pending"
        description="Upload, sharing, and AI features stay blocked until the email verification flow is completed."
        className={className}
      />
    );
  }

  return verified ? (
    <Badge
      className={cn(
        "gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-500",
        className,
      )}
    >
      <RiCheckboxCircleLine className="size-3.5" />
      Email verified
    </Badge>
  ) : (
    <Badge
      className={cn(
        "gap-2 border-amber-500/80 bg-amber-400/15 px-3 py-1 text-amber-950 shadow-sm shadow-amber-500/10 hover:bg-amber-400/15 dark:border-amber-400/60 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/10",
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
