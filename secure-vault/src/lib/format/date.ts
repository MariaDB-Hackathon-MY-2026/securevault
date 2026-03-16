import { format } from "date-fns";

export function formatDisplayDate(date: Date | string): string {
  return format(toDate(date), "dd/MM/yyyy");
}

export function formatDisplayDateTime(date: Date | string): string {
  return format(toDate(date), "dd/MM/yyyy, HH:mm");
}

function toDate(date: Date | string): Date {
  return typeof date === "string" ? new Date(date) : date;
}
