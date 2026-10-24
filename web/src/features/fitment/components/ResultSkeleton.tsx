import type { ReactElement } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const BONE = "bg-(--fitment-canvas-2)";

function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-(--fitment-line) bg-white">
      <Skeleton className={cn("h-[180px] rounded-none", BONE)} />
      <div className="flex flex-col gap-3 px-5 pt-[18px] pb-5">
        <Skeleton className={cn("h-4 w-[200px] max-w-full rounded-lg", BONE)} />
        <Skeleton className={cn("h-3 w-[140px] max-w-full rounded-lg", BONE)} />
        <Skeleton className={cn("h-7 w-[160px] max-w-full rounded-lg", BONE)} />
        <Skeleton className={cn("h-3 w-[240px] max-w-full rounded-lg", BONE)} />
        <Skeleton className={cn("h-3 w-[180px] max-w-full rounded-lg", BONE)} />
        <Skeleton className={cn("h-3 w-[150px] max-w-full rounded-lg", BONE)} />
        <Skeleton className={cn("h-11 rounded-input", BONE)} />
      </div>
    </div>
  );
}

export function ResultSkeleton(): ReactElement {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Checking fitment</span>
      <Skeleton className={cn("h-16 rounded-xl", BONE)} />
      <Skeleton className={cn("h-[148px] rounded-card", BONE)} />
      <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        <ListingCardSkeleton />
        <ListingCardSkeleton />
        <ListingCardSkeleton />
      </div>
    </div>
  );
}
