import type { ReactElement } from "react";
import { IdCard } from "lucide-react";
import { Card } from "@/components/ui/card";

const SAMPLE_VIN = "WDD2050421R123456";

export function VinHint(): ReactElement {
  return (
    <Card className="gap-4 rounded-card bg-white p-6 ring-0 border border-(--fitment-line)">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg leading-[26px] font-bold text-ink">Where to find your VIN</h2>
        <p className="text-[13px] leading-5 text-(color:--fitment-fg-2)">
          Your VIN is printed on the vehicle registration card (Mulkiya), next to &quot;Chassis No.&quot;
        </p>
      </div>
      <div aria-hidden className="flex flex-col gap-2.5 rounded-input bg-(--fitment-canvas-2) p-4">
        <div className="flex items-center gap-2 text-(color:--fitment-fg-2)">
          <IdCard className="size-5" />
          <p className="text-xs leading-4 font-semibold">Vehicle registration card</p>
        </div>
        <div className="h-2 w-[220px] max-w-full rounded-lg bg-(--fitment-line-2)" />
        <div className="h-2 w-[160px] max-w-full rounded-lg bg-(--fitment-line-2)" />
        <div className="flex flex-wrap items-center gap-x-2 rounded-lg border-[1.5px] border-brand bg-white px-2.5 py-2">
          <p className="text-xs leading-4 font-semibold text-(color:--fitment-fg-2)">Chassis No.</p>
          <p className="font-mono text-sm leading-5 font-medium text-ink">{SAMPLE_VIN}</p>
        </div>
        <div className="h-2 w-[190px] max-w-full rounded-lg bg-(--fitment-line-2)" />
      </div>
    </Card>
  );
}
