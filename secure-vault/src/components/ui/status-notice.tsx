import type { ElementType, ReactNode } from "react";
import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
} from "@remixicon/react";

import { cn } from "@/lib/utils";

const toneStyles = {
  success: {
    container: "border border-emerald-500/40 bg-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    container: "border border-amber-500/60 bg-amber-500/10 shadow-sm shadow-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
  },
  error: {
    container:
      "border border-destructive/40 bg-destructive/5 shadow-sm shadow-destructive/10",
    icon: "text-destructive",
  },
  info: {
    container: "border border-border/60 bg-muted/40",
    icon: "text-foreground",
  },
} as const;

const toneIcons: Record<keyof typeof toneStyles, ElementType> = {
  success: RiCheckboxCircleLine,
  warning: RiErrorWarningLine,
  error: RiCloseCircleLine,
  info: RiInformationLine,
};

type StatusNoticeProps = {
  tone?: keyof typeof toneStyles;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ElementType;
  className?: string;
};

export function StatusNotice({
  tone = "info",
  title,
  description,
  icon: Icon = toneIcons[tone],
  className,
}: StatusNoticeProps) {
  const styles = toneStyles[tone];

  return (
    <div className={cn("flex items-start gap-3 p-4 text-sm", styles.container, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", styles.icon)} />
      <div className="space-y-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
