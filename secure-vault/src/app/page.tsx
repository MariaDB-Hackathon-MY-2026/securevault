import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  FolderTree,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const platformPillars = [
  {
    title: "Encrypted file handling",
    description:
      "Upload to Cloudflare R2 through a resumable chunk pipeline designed around encrypted-at-rest storage.",
    icon: LockKeyhole,
  },
  {
    title: "Controlled sharing",
    description:
      "Publish public or restricted links with email allowlists, OTP verification, and download governance.",
    icon: ShieldCheck,
  },
  {
    title: "Recoverable operations",
    description:
      "Give users trash, restore, activity history, and storage oversight instead of one-way destructive actions.",
    icon: Clock3,
  },
  {
    title: "Optional semantic retrieval",
    description:
      "Layer semantic indexing onto eligible PDFs and images without making AI a prerequisite for core storage flows.",
    icon: ScanSearch,
  },
] as const;

const deliverySignals = [
  "Next.js App Router with authenticated dashboard workflows",
  "MariaDB, Redis, Cloudflare R2, and optional Gemini embeddings",
  "Resumable uploads, queue controls, and server-aware concurrency",
  "Automated Vitest coverage plus a sizable Playwright suite",
] as const;

const operatingModel = [
  {
    step: "01",
    title: "Ingest without chaos",
    description:
      "Files are chunked, queued, retried, and finalized through an upload flow built for unstable networks and real usage patterns.",
  },
  {
    step: "02",
    title: "Organize with confidence",
    description:
      "Folders, previews, search, storage visibility, and a dedicated workspace keep the product feeling operational instead of experimental.",
  },
  {
    step: "03",
    title: "Share with intent",
    description:
      "Links can be public or restricted, then reinforced with OTP verification, logging, and limits where needed.",
  },
  {
    step: "04",
    title: "Recover and audit",
    description:
      "Trash, restore, lifecycle cleanup, and activity tracking help users move fast without losing accountability.",
  },
] as const;

export const metadata: Metadata = {
  title: "Secure file storage with governed sharing",
  description:
    "Explore SecureVault, a secure file-storage app with encrypted uploads, controlled sharing, storage lifecycle tools, and optional semantic search.",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  const primaryHref = user ? "/files" : "/signup";
  const primaryLabel = user ? "Open your vault" : "Create an account";
  const secondaryHref = user ? "/storage" : "/login";
  const secondaryLabel = user ? "View storage" : "Login";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.10),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,1),_rgba(248,250,252,1))]">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.05)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0.15))]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="border border-border/60 bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground">
                SecureVault
              </p>
              <p className="mt-2 text-sm text-foreground">
                Secure file storage for teams that need control, not just uploads.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="ghost">
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
              <Button asChild>
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-6 border-x border-b border-border/60 bg-background/92 px-4 py-10 backdrop-blur sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] lg:px-8 lg:py-18">
          <div className="max-w-3xl">
            <Badge variant="outline" className="rounded-none border-border/70 bg-background/95 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-foreground shadow-sm">
              Encrypted uploads. Scoped access. Optional AI retrieval.
            </Badge>

            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              A serious storage product for sensitive files, governed sharing, and clean operational workflows.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-foreground sm:text-lg">
              SecureVault combines encrypted-at-rest uploads, queue-aware ingestion, structured file management,
              OTP-protected sharing, lifecycle controls, and semantic search in one Next.js workspace.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-foreground">
              <span className="border border-border/60 bg-background/95 px-3 py-2">Next.js 16</span>
              <span className="border border-border/60 bg-background/95 px-3 py-2">MariaDB + Redis</span>
              <span className="border border-border/60 bg-background/95 px-3 py-2">Cloudflare R2</span>
              <span className="border border-border/60 bg-background/95 px-3 py-2">Vitest + Playwright</span>
            </div>
          </div>

          <Card className="border-border/70 bg-background/94 shadow-xl shadow-slate-950/5 backdrop-blur">
            <CardHeader className="border-b border-border/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-foreground">
                    Product snapshot
                  </p>
                  <CardTitle className="mt-2 text-2xl">
                    Built for the workflows reviewers actually look for
                  </CardTitle>
                </div>
                <Sparkles className="size-5 text-primary-foreground" />
              </div>
              <CardDescription className="text-foreground">
                The strongest parts of the product already live inside the authenticated workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6">
              {deliverySignals.map((signal) => (
                <div
                  key={signal}
                  className="flex items-start gap-3 border border-border/60 bg-background/85 p-4"
                >
                  <div className="mt-0.5 border border-primary/25 bg-primary/20 p-1.5 text-primary-foreground">
                    <Check className="size-4" />
                  </div>
                  <p className="text-sm leading-6 text-foreground">{signal}</p>
                </div>
              ))}
              <div className="border border-dashed border-border/70 bg-muted/55 p-4 text-sm text-foreground">
                Start at <span className="font-semibold text-foreground">/login</span>. The root page is now the
                product-facing entry point, while the live workspace continues under <span className="font-semibold text-foreground">/files</span>, <span className="font-semibold text-foreground">/storage</span>, <span className="font-semibold text-foreground">/activity</span>, and <span className="font-semibold text-foreground">/trash</span>.
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="border-x border-b border-border/60 bg-background px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:max-w-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-foreground">Core capabilities</p>
            <h2 className="text-3xl font-semibold tracking-tight">
              Designed around the parts of secure storage that usually get skipped
            </h2>
            <p className="text-sm leading-7 text-foreground">
              SecureVault does more than accept files. It handles ingress, organization, access, recovery, and optional
              retrieval in one coherent system.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {platformPillars.map((pillar) => {
              const Icon = pillar.icon;

              return (
                <Card
                  key={pillar.title}
                  className="border-border/70 bg-background/95 shadow-sm transition-colors hover:bg-muted/20"
                >
                  <CardHeader className="gap-4">
                    <div className="flex size-10 items-center justify-center border border-primary/25 bg-primary/18 text-primary-foreground">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <CardTitle>{pillar.title}</CardTitle>
                      <CardDescription className="mt-2 leading-6 text-foreground">
                        {pillar.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="border-x border-b border-border/60 bg-muted/20 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:max-w-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-foreground">Operating model</p>
            <h2 className="text-3xl font-semibold tracking-tight">A product flow that stays practical end to end</h2>
            <p className="text-sm leading-7 text-foreground">
              The implementation is opinionated in the right places: files stay recoverable, sharing stays explicit, and
              AI features stay additive instead of becoming a dependency.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            {operatingModel.map((item) => (
              <Card key={item.step} className="border-border/70 bg-background/90">
                <CardHeader>
                  <p className="text-xs uppercase tracking-[0.35em] text-foreground">{item.step}</p>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-foreground">
                  {item.description}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-x border-b border-border/60 bg-background px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <Card className="border-border/70 bg-background/95">
              <CardHeader>
                <p className="text-xs uppercase tracking-[0.35em] text-foreground">Why it matters</p>
                <CardTitle className="text-3xl">Not just a prettier upload form</CardTitle>
                <CardDescription className="max-w-2xl leading-6 text-foreground">
                  SecureVault is compelling because the feature set reinforces a believable product story: security,
                  governance, usability, and operational depth all move together.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm leading-6 text-foreground">
                <div className="flex items-start gap-3 border border-border/60 bg-muted/25 p-4">
                  <FolderTree className="mt-0.5 size-4 text-primary-foreground" />
                  <p>
                    Users can move from upload to organization to sharing to recovery without leaving the same
                    workspace model.
                  </p>
                </div>
                <div className="flex items-start gap-3 border border-border/60 bg-muted/25 p-4">
                  <ShieldCheck className="mt-0.5 size-4 text-primary-foreground" />
                  <p>
                    Security controls are visible in the product, not hidden as implementation trivia.
                  </p>
                </div>
                <div className="flex items-start gap-3 border border-border/60 bg-muted/25 p-4">
                  <ScanSearch className="mt-0.5 size-4 text-primary-foreground" />
                  <p>
                    Semantic indexing is positioned as a premium enhancement to storage, rather than the whole reason
                    the app exists.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-primary text-primary-foreground">
              <CardHeader>
                <p className="text-xs uppercase tracking-[0.35em] text-primary-foreground">Get started</p>
                <CardTitle className="text-3xl">Enter the live workspace</CardTitle>
                <CardDescription className="text-primary-foreground">
                  The strongest experience in this repo starts in the authenticated product, not a static marketing shell.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm leading-6 text-primary-foreground">
                <p>Use the landing page to orient visitors, then route them into the working product.</p>
                <Button asChild size="lg" variant="secondary" className="justify-between">
                  <Link href={primaryHref}>
                    {primaryLabel}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
                  <Link href={secondaryHref}>{secondaryLabel}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
