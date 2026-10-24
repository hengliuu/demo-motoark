import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background">
      <h1 className="font-display text-4xl font-bold text-ink">MotoArk demo</h1>
      <Link href="/fitment" className="text-base font-semibold text-brand underline underline-offset-4">
        Check part fitment
      </Link>
    </main>
  );
}
