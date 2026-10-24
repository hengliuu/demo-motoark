import type { ReactElement } from "react";
import Link from "next/link";

const DEMO_TAG = "DEMO";

export function NavBar(): ReactElement {
  return (
    <header className="bg-ink">
      <DesktopNav />
      <MobileNav />
    </header>
  );
}

function DesktopNav(): ReactElement {
  return (
    <nav
      aria-label="Main"
      className="mx-auto hidden max-w-[1440px] items-center justify-between gap-6 px-8 py-3.5 md:flex xl:px-[120px]"
    >
      <div className="flex min-w-0 items-center gap-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-[22px] font-extrabold tracking-[-0.22px] text-white">MotoArk</span>
          <span className="rounded-md border border-ink-3 px-2 py-[3px] text-[10px] font-bold tracking-[0.8px] text-fg-4">
            {DEMO_TAG}
          </span>
        </Link>
      </div>
      <div className="flex items-center gap-7 text-sm">
        <Link
          href="/fitment"
          aria-current="page"
          className="border-b-2 border-white pt-2 pb-1 font-bold text-white"
        >
          Fitment Check
        </Link>
      </div>
    </nav>
  );
}

function MobileNav(): ReactElement {
  return (
    <nav aria-label="Main" className="flex h-14 items-center gap-3 px-4 md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="font-display text-xl leading-[30px] font-extrabold tracking-[-0.4px] text-white">
          MotoArk
        </span>
        <span className="rounded-sm border border-fg-4 px-1.5 py-0.5 text-[10px] leading-4 font-bold tracking-[1px] text-dk-muted">
          {DEMO_TAG}
        </span>
      </Link>
      <div className="flex-1" />
      <Link href="/fitment" aria-current="page" className="text-sm font-bold text-white underline underline-offset-4">
        Fitment Check
      </Link>
    </nav>
  );
}
