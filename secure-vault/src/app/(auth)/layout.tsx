export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-4 sm:p-8 overflow-hidden z-0">
      {children}
    </div>
  );
}
