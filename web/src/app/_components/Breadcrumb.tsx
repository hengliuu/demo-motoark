import Link from "next/link";

export function Breadcrumb() {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto w-full max-w-[1200px] px-4 pt-4 text-[13px] leading-5 text-[#475467] md:px-8"
    >
      <ol className="flex items-center gap-2">
        <li>
          <Link href="/" className="hover:underline">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">Fitment check</li>
      </ol>
    </nav>
  );
}
