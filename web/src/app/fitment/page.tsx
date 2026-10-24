import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Breadcrumb } from "../_components/Breadcrumb";
import { NavBar } from "../_components/NavBar";
import { FitmentCheck } from "@/features/fitment/components";

export const metadata: Metadata = {
  title: "Fitment check",
};

export default function FitmentPage(): ReactElement {
  return (
    <>
      <NavBar />
      <Breadcrumb />
      <FitmentCheck />
    </>
  );
}
