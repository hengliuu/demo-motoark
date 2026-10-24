import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "@/lib/query-provider";
import { FitmentCheck } from "./FitmentCheck";

const VEHICLE = { vin: "WDD2050421R123456", make: "Mercedes-Benz", model: "C 200", chassis: "W205", year: 2019 };

const FITS_BODY = {
  result: "fits",
  vehicle: VEHICLE,
  part: { number: "A0004204102", name: "Front brake pad set" },
  resolved: { number: "A0004204102", name: "Front brake pad set", chain: ["A0004204102"] },
  listings: [
    { id: "L-1001", yard: "Al Quoz Auto Recyclers", grade: "A", price_aed: 899, warranty_days: 30, delivery: "Next day" },
    { id: "L-1002", yard: "Sharjah Parts Yard", grade: "B", price_aed: 1250, warranty_days: 14, delivery: "2 to 3 days" },
  ],
};

const SUPERSEDED_BODY = {
  result: "superseded",
  vehicle: VEHICLE,
  part: { number: "A2059062203", name: "Headlamp, left" },
  resolved: { number: "A2059065903", name: "Headlamp, left", chain: ["A2059062203", "A2059065903"] },
  listings: [
    { id: "L-2001", yard: "Sharjah Parts Yard", grade: "A", price_aed: 1250, warranty_days: 30, delivery: "Next day" },
  ],
};

const NO_FIT_BODY = {
  result: "no_fit",
  vehicle: VEHICLE,
  part: { number: "A1669060103", name: "Headlamp, left (W166)" },
  resolved: { number: "A1669060103", name: "Headlamp, left (W166)", chain: ["A1669060103"] },
  listings: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(...responses: Array<Response | Error>): ReturnType<typeof vi.fn> {
  const queue = [...responses];
  const fetchMock = vi.fn(() => {
    const next = queue.shift() ?? responses[responses.length - 1];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function fillAndSubmit(part: string, vin: string) {
  const user = userEvent.setup();
  render(
    <QueryProvider>
      <FitmentCheck />
    </QueryProvider>,
  );
  await user.type(screen.getByLabelText("Part number"), part);
  await user.type(screen.getByLabelText("VIN"), vin);
  await user.click(screen.getByRole("button", { name: "Check fitment" }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FitmentCheck", () => {
  it("shows the empty state with the VIN hint", () => {
    render(
      <QueryProvider>
        <FitmentCheck />
      </QueryProvider>,
    );
    expect(screen.getByRole("heading", { name: "Will this part fit your car?" })).toBeInTheDocument();
    expect(screen.getByText("Where to find your VIN")).toBeInTheDocument();
  });

  it("MOTO-01-TC05 a 16-character VIN shows the inline error and sends no request", async () => {
    const fetchMock = stubFetch(jsonResponse(FITS_BODY));
    await fillAndSubmit("A0004204102", "WDD2050421R12345");
    expect(await screen.findByText("Enter the 17-character VIN from your registration card")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("MOTO-01-TC01 a fitting part shows the Fits banner, the vehicle and the listings with Tabby lines", async () => {
    stubFetch(jsonResponse(FITS_BODY));
    await fillAndSubmit("A 000 420 41 02", "wdd2050421r123456");
    expect(await screen.findByText("Fits your vehicle")).toBeInTheDocument();
    expect(
      screen.getByText("A 000 420 41 02 is listed for this Mercedes-Benz C 200 (W205, 2019) in the official catalogue."),
    ).toBeInTheDocument();
    expect(screen.getByText("AED 899")).toBeInTheDocument();
    expect(screen.getByText("or 4 payments of AED 224.75 with Tabby")).toBeInTheDocument();
    expect(screen.getByText("AED 1,250")).toBeInTheDocument();
    expect(screen.getByText("or 4 payments of AED 312.50 with Tabby")).toBeInTheDocument();
    expect(screen.getByText("2 sellers have this part")).toBeInTheDocument();
  });

  it("MOTO-01-TC04 the request carries the normalised part number and the uppercased VIN", async () => {
    const fetchMock = stubFetch(jsonResponse(FITS_BODY));
    await fillAndSubmit("a-000.420 41 02", "wdd2050421r123456");
    await screen.findByText("Fits your vehicle");
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("part=A0004204102");
    expect(url).toContain("vin=WDD2050421R123456");
  });

  it("MOTO-01-TC02 a superseded part shows the amber banner with the old and the new number", async () => {
    stubFetch(jsonResponse(SUPERSEDED_BODY));
    await fillAndSubmit("A2059062203", "WDD2050421R123456");
    expect(await screen.findByText("Superseded, and the new number fits")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A 205 906 22 03 was replaced by A 205 906 59 03, which fits this Mercedes-Benz C 200. The listings below are for the new number.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 seller has this part")).toBeInTheDocument();
  });

  it("MOTO-01-TC03 a part that does not fit shows the red banner and a link to search by vehicle", async () => {
    stubFetch(jsonResponse(NO_FIT_BODY));
    await fillAndSubmit("A1669060103", "WDD2050421R123456");
    expect(await screen.findByText("Does not fit this vehicle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search parts for your C 200 (W205)" })).toBeInTheDocument();
    expect(screen.queryByText(/sellers? has? this part|sellers have this part/)).not.toBeInTheDocument();
  });

  it("MOTO-01-TC07 an unknown VIN shows the message under the VIN field and keeps the form", async () => {
    stubFetch(
      jsonResponse(
        { error: { code: "unknown_vin", message: "We couldn't find this VIN. Check it against your registration card" } },
        404,
      ),
    );
    await fillAndSubmit("A0004204102", "WDD2050421R999999");
    expect(
      await screen.findByText("We couldn't find this VIN. Check it against your registration card"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("VIN")).toHaveValue("WDD2050421R999999");
  });

  it("MOTO-01-TC10 an unavailable API shows Try again, and Try again retries the same values", async () => {
    const fetchMock = stubFetch(new TypeError("Failed to fetch"), jsonResponse(FITS_BODY));
    const user = await fillAndSubmit("A0004204102", "WDD2050421R123456");
    expect(await screen.findByText("Fitment check is unavailable right now")).toBeInTheDocument();
    expect(screen.getByLabelText("Part number")).toHaveValue("A0004204102");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Fits your vehicle")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(String(fetchMock.mock.calls[0]?.[0]));
  });

  it("disables the button and shows the skeleton while the check runs", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve))),
    );
    await fillAndSubmit("A0004204102", "WDD2050421R123456");

    const button = await screen.findByRole("button", { name: "Check fitment" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("Checking fitment");

    resolveFetch(jsonResponse(FITS_BODY));
    expect(await screen.findByText("Fits your vehicle")).toBeInTheDocument();
  });

  it("New search returns to an empty form", async () => {
    stubFetch(jsonResponse(FITS_BODY));
    const user = await fillAndSubmit("A0004204102", "WDD2050421R123456");
    await screen.findByText("Fits your vehicle");
    await user.click(screen.getByRole("button", { name: "New search" }));
    expect(screen.getByLabelText("Part number")).toHaveValue("");
    expect(screen.getByLabelText("VIN")).toHaveValue("");
  });
});
