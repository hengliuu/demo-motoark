import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FitmentResponse } from "../types";
import { formatPartNumber } from "../utils/format";

const EYEBROW = "text-xs leading-4 font-bold tracking-[1.2px] text-(color:--fitment-fg-4)";
const HEADING = "font-display text-2xl leading-[30px] font-extrabold tracking-[-0.48px] text-white";

interface ResultSummaryProps {
  response: FitmentResponse;
  onNewSearch: () => void;
}

export function ResultSummary({ response, onNewSearch }: ResultSummaryProps) {
  const { vehicle, part, resolved } = response;
  const partName = part.name || resolved.name;

  return (
    <section
      aria-label="Vehicle and part checked"
      className="flex flex-col gap-3.5 rounded-card bg-ink p-5 md:flex-row md:items-center md:gap-8 md:px-8 md:py-7"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={EYEBROW}>VEHICLE</p>
        <p className={HEADING}>
          {vehicle.make} {vehicle.model}
        </p>
        <p className="text-[13px] leading-5 text-(color:--fitment-dk-muted)">
          {vehicle.chassis}, {vehicle.year}
        </p>
        <p className="font-mono text-[13px] leading-5 font-medium break-all text-white md:text-(color:--fitment-dk-muted)">
          VIN&nbsp; {vehicle.vin}
        </p>
      </div>
      <div aria-hidden className="h-px w-full bg-(--fitment-ink-3) md:h-[84px] md:w-px" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={EYEBROW}>PART</p>
        {partName && <p className={HEADING}>{partName}</p>}
        <p className="text-[13px] leading-5 text-(color:--fitment-dk-muted)">OEM part number</p>
        <p className="font-mono text-[13px] leading-5 font-medium text-white md:text-[15px]">
          {formatPartNumber(part.number)}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onNewSearch}
        className="h-11 gap-2 rounded-input border-(--fitment-line-2) bg-white px-[18px] text-[15px] font-bold text-ink hover:bg-white/90"
      >
        <Search aria-hidden className="size-[18px]" />
        New search
      </Button>
    </section>
  );
}
