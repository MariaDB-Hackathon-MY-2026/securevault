import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TrashPageContent() {
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Trash</p>
        <h2 className="mt-2 text-3xl font-semibold">Deleted items</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The route exists now so the dashboard shell is complete. Trash behavior will be filled in during the soft-delete phase.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nothing in trash</CardTitle>
          <CardDescription>
            This area is reserved for deleted files and folders with restore and permanent delete controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Authentication and navigation are already in place for when that workflow is added.
        </CardContent>
      </Card>
    </div>
  );
}
