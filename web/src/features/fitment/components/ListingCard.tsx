import { ImageIcon, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { FitmentListing } from "../types";
import { formatAED, tabbySplit } from "../utils/format";

const GRADE_STYLES = {
  A: "bg-(--fitment-ok-soft) text-(color:--fitment-ok-fg)",
  B: "bg-(--fitment-canvas-2) text-(color:--fitment-ink-3)",
  C: "bg-(--fitment-canvas-2) text-(color:--fitment-ink-3)",
} satisfies Record<FitmentListing["grade"], string>;

export function ListingCard({ listing }: { listing: FitmentListing }) {
  return (
    <Card
      data-listing-id={listing.id}
      className="gap-0 rounded-card bg-white py-0 ring-0 border border-(--fitment-line)"
    >
      <div className="flex h-[180px] items-center justify-center bg-(--fitment-photo)">
        <ImageIcon aria-hidden className="size-8 text-(color:--fitment-fg-4)" />
      </div>
      <div className="flex flex-col gap-3.5 px-5 pt-[18px] pb-5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-[15px] leading-5 font-bold text-ink">{listing.yard}</h3>
          <Badge
            className={cn("h-auto rounded-full px-2.5 py-[3px] text-xs leading-4 font-semibold", GRADE_STYLES[listing.grade])}
          >
            Grade {listing.grade}
          </Badge>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-[28px] leading-8 font-extrabold tracking-[-0.56px] text-ink">
            {formatAED(listing.priceAed)}
          </p>
          <p className="text-[13px] leading-5 text-(color:--fitment-fg-2)">
            or 4 payments of {tabbySplit(listing.priceAed)} with Tabby
          </p>
        </div>
        <Separator className="bg-(--fitment-line)" />
        <ul className="flex flex-col gap-2 text-[13px] leading-5 text-(color:--fitment-ink-3)">
          <li className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-4 shrink-0" />
            {listing.warrantyDays}-day warranty
          </li>
          <li className="flex items-center gap-2">
            <Truck aria-hidden className="size-4 shrink-0" />
            Delivery: {listing.delivery}
          </li>
        </ul>
        <Button type="button" className="h-11 w-full gap-2 rounded-input bg-ink px-[18px] text-[15px] font-bold text-white hover:bg-ink/90">
          <ShoppingCart aria-hidden className="size-[18px]" />
          Add to cart
        </Button>
      </div>
    </Card>
  );
}
