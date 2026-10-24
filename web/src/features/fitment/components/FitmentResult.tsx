import type { FitmentResponse } from "../types";
import { ListingCard } from "./ListingCard";
import { NoFitNextStep } from "./NoFitNextStep";
import { ResultBanner } from "./ResultBanner";
import { ResultSummary } from "./ResultSummary";

interface FitmentResultProps {
  response: FitmentResponse;
  searched: string;
  onNewSearch: () => void;
}

function sellerCount(count: number, result: FitmentResponse["result"]): string {
  const what = result === "superseded" ? "the new part" : "this part";
  return count === 1 ? `1 seller has ${what}` : `${count} sellers have ${what}`;
}

export function FitmentResult({ response, searched, onNewSearch }: FitmentResultProps) {
  const { listings } = response;

  return (
    <div className="flex flex-col gap-6">
      <ResultBanner response={response} />
      <ResultSummary response={response} searched={searched} onNewSearch={onNewSearch} />
      {response.result === "no_fit" ? (
        <NoFitNextStep vehicle={response.vehicle} onCheckAnother={onNewSearch} />
      ) : (
        listings.length > 0 && (
          <section aria-labelledby="listings-heading" className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2
                id="listings-heading"
                className="font-display text-2xl leading-[30px] font-extrabold tracking-[-0.48px] text-ink"
              >
                {sellerCount(listings.length, response.result)}
              </h2>
              <p className="text-sm leading-5 text-(color:--fitment-fg-2)">Sorted by lowest price</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
