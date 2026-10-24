import { CircleCheck, CircleX, RefreshCw, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { FitmentResponse, FitmentResult } from "../types";
import { formatPartNumber } from "../utils/format";

interface BannerStyle {
  icon: LucideIcon;
  container: string;
  iconColor: string;
  title: string;
}

const BANNER_STYLES = {
  fits: {
    icon: CircleCheck,
    container: "border-(--fitment-ok-line) bg-(--fitment-ok-soft)",
    iconColor: "text-(color:--fitment-ok-icon)!",
    title: "text-(color:--fitment-ok-fg)",
  },
  superseded: {
    icon: RefreshCw,
    container: "border-(--fitment-warn-line) bg-(--fitment-warn-soft)",
    iconColor: "text-(color:--fitment-warn-icon)!",
    title: "text-(color:--fitment-warn-fg)",
  },
  no_fit: {
    icon: CircleX,
    container: "border-(--fitment-red-line) bg-(--fitment-red-soft)",
    iconColor: "text-brand!",
    title: "text-(color:--fitment-red-fg)",
  },
} satisfies Record<FitmentResult, BannerStyle>;

function bannerCopy({ result, vehicle, part, resolved }: FitmentResponse): { title: string; description: string } {
  const vehicleName = `${vehicle.make} ${vehicle.model}`;
  const requested = formatPartNumber(part.number);

  switch (result) {
    case "fits":
      return {
        title: "Fits your vehicle",
        description: `${requested} is listed for this ${vehicleName} (${vehicle.chassis}, ${vehicle.year}) in the official catalogue.`,
      };
    case "superseded":
      return {
        title: "Superseded, and the new number fits",
        description: `${requested} was replaced by ${formatPartNumber(resolved.number)}, which fits this ${vehicleName}. The listings below are for the new number.`,
      };
    case "no_fit":
      return {
        title: "Does not fit this vehicle",
        description: `${requested} is not listed for your ${vehicleName} (${vehicle.chassis}).`,
      };
    default: {
      const unreachable: never = result;
      throw new Error(`Unhandled fitment result: ${unreachable}`);
    }
  }
}

export function ResultBanner({ response }: { response: FitmentResponse }) {
  const style = BANNER_STYLES[response.result];
  const { title, description } = bannerCopy(response);
  const Icon = style.icon;

  return (
    <Alert
      data-result={response.result}
      className={cn("gap-y-0.5 rounded-xl p-4 has-[>svg]:gap-x-3", style.container)}
    >
      <Icon aria-hidden className={cn("size-5 translate-y-0 self-start", style.iconColor)} />
      <AlertTitle className={cn("text-[15px] leading-5 font-bold", style.title)}>{title}</AlertTitle>
      <AlertDescription className="text-[13px] leading-5 text-(color:--fitment-ink-3) md:text-balance">
        {description}
      </AlertDescription>
    </Alert>
  );
}
