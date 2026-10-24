import { CloudOff, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FITMENT_MESSAGES } from "../constants/fitment-messages";

export function UnavailableAlert({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <Alert className="min-w-0 flex-1 gap-y-0.5 rounded-xl border-(--fitment-red-line) bg-(--fitment-red-soft) p-4 has-[>svg]:gap-x-3">
        <CloudOff aria-hidden className="size-5 translate-y-0 self-start text-brand!" />
        <AlertTitle className="text-[15px] leading-5 font-bold text-(color:--fitment-red-fg)">
          {FITMENT_MESSAGES.unavailable}
        </AlertTitle>
        <AlertDescription className="text-[13px] leading-5 text-(color:--fitment-ink-3)">
          Your details are still in the form. Try again in a moment.
        </AlertDescription>
      </Alert>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="h-11 gap-2 rounded-input border-(--fitment-line-2) bg-white px-[18px] text-[15px] font-bold text-ink"
      >
        <RotateCw aria-hidden className="size-[18px]" />
        Try again
      </Button>
    </div>
  );
}
