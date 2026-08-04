import type { Metadata } from "next";
import MentalHealthDemo from "@/components/MentalHealthDemo";

export const metadata: Metadata = {
  title: "Reflection mode experiment | Dharmic Data Tutor",
  description:
    "An inspectable demonstration of input checks, application routing, bounded generation, and output review.",
};

export default function MentalHealthPage() {
  return <MentalHealthDemo />;
}
