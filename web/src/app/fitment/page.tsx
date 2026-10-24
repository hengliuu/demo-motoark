import type { Metadata } from "next";
import { Breadcrumb } from "../_components/Breadcrumb";
import { NavBar } from "../_components/NavBar";
import { FitmentCheck } from "@/features/fitment/components";

export const metadata: Metadata = {
  title: "Fitment check",
};

export default function FitmentPage() {
  return (
    <>
      <NavBar />
      <Breadcrumb />
      <FitmentCheck />
    </>
  );
}
