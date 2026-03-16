import {
  RiDeleteBin6Line,
  RiFolder3Line,
  RiPulseLine,
  RiSettings3Line,
} from "@remixicon/react";

export const dashboardNavigationItems = [
  { href: "/files", label: "Files", icon: RiFolder3Line },
  { href: "/trash", label: "Trash", icon: RiDeleteBin6Line },
  { href: "/activity", label: "Activity", icon: RiPulseLine },
  { href: "/settings", label: "Settings", icon: RiSettings3Line },
] as const;

export function getDashboardSectionLabel(pathname: string) {
  return dashboardNavigationItems.find((item) => pathname === item.href)?.label ?? "Workspace";
}
