import { Skeleton } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="rounded-lg border border-border/60">
        <div className="grid gap-2 border-b border-border/60 p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <div className="space-y-0">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className={`grid gap-3 px-6 py-5 ${row === 3 ? "" : "border-b border-border/60"}`}
            >
              <div className="flex gap-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
