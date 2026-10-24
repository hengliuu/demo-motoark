import { Menu, Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";

const DEMO_TAG = "DEMO";
const PASSIVE_NAV_ITEMS = ["Brands", "How it works"] as const;

export function NavBar() {
  return (
    <header className="bg-ink">
      <DesktopNav />
      <MobileNav />
    </header>
  );
}

function DesktopNav() {
  return (
    <nav
      aria-label="Main"
      className="mx-auto hidden max-w-[1440px] items-center justify-between gap-6 px-8 py-3.5 md:flex xl:px-[120px]"
    >
      <div className="flex min-w-0 items-center gap-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-[22px] font-extrabold tracking-[-0.22px] text-white">MotoArk</span>
          <span className="rounded-md border border-[#344054] px-2 py-[3px] text-[10px] font-bold tracking-[0.8px] text-[#98a2b3]">
            {DEMO_TAG}
          </span>
        </Link>
        <div
          aria-hidden="true"
          className="hidden w-[400px] items-center gap-2.5 rounded-[10px] bg-white px-3.5 py-[11px] text-sm text-[#98a2b3] lg:flex"
        >
          <Search className="size-[18px]" />
          Part number, part name or car
        </div>
      </div>
      <div className="flex items-center gap-7 text-sm">
        {PASSIVE_NAV_ITEMS.map((label) => (
          <span key={label} className="pt-2 pb-[8px] font-semibold text-[#d0d5dd]">
            {label}
          </span>
        ))}
        <Link
          href="/fitment"
          aria-current="page"
          className="border-b-2 border-white pt-2 pb-1 font-bold text-white"
        >
          Fitment Check
        </Link>
        <ShoppingCart aria-hidden="true" className="size-5 text-white" />
        <span className="flex items-center gap-1.5 font-semibold text-white">
          <User aria-hidden="true" className="size-4" />
          Log in
        </span>
        <span className="rounded-[10px] bg-white px-4 py-2.5 font-bold text-ink">Create Account</span>
      </div>
    </nav>
  );
}

function MobileNav() {
  return (
    <nav aria-label="Main" className="flex h-14 items-center gap-3 px-4 md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="font-display text-xl leading-[30px] font-extrabold tracking-[-0.4px] text-white">
          MotoArk
        </span>
        <span className="rounded-sm border border-[#98a2b3] px-1.5 py-0.5 text-[10px] leading-4 font-bold tracking-[1px] text-[#d0d5dd]">
          {DEMO_TAG}
        </span>
      </Link>
      <div className="flex-1" />
      <Search aria-hidden="true" className="size-[22px] text-white" />
      <ShoppingCart aria-hidden="true" className="size-[22px] text-white" />
      <Menu aria-hidden="true" className="size-[22px] text-white" />
    </nav>
  );
}
