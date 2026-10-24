import type { ReactElement } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FitmentResponse } from "../types/fitment-schema";

interface NoFitNextStepProps {
  vehicle: FitmentResponse["vehicle"];
  onCheckAnother: () => void;
}

export function NoFitNextStep({ vehicle, onCheckAnother }: NoFitNextStepProps): ReactElement {
  return (
    <Card className="gap-4 rounded-card bg-white px-5 py-5 ring-0 border border-(--fitment-line) md:flex-row md:items-center md:gap-6 md:px-7 md:py-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-lg leading-[26px] font-bold text-ink">Find parts that fit your {vehicle.model}</h2>
        <p className="text-[15px] leading-[22px] text-(color:--fitment-fg-2)">
          Check another part number for your {vehicle.model} ({vehicle.chassis}). Your VIN stays filled in.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onCheckAnother}
        className="h-11 gap-2 rounded-input border-(--fitment-line-2) bg-white px-[18px] text-[15px] font-bold text-ink"
      >
        <Search aria-hidden className="size-[18px]" />
        Check another part
      </Button>
    </Card>
  );
}
