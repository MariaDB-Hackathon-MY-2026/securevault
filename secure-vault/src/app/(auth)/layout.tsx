export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_30%),linear-gradient(180deg,_rgba(15,23,42,0.05),_transparent_42%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent" />
        <div className="absolute -left-20 top-16 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-[-6rem] top-1/3 size-72 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/4 size-80 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:linear-gradient(180deg,rgba(255,255,255,0.45),transparent)]" />
      </div>

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center p-4 sm:p-8">
        {children}
      </div>
    </main>
  );
}
