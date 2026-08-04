import type { Metadata } from "next";
import Link from "next/link";
import MentalHealthDemo from "@/components/MentalHealthDemo";
import styles from "./mental-health.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Voice Receptionist Demo | Dharmic Data",
  description:
    "Hear a complete synthetic AI receptionist call from greeting to goodbye, powered by Together natural voice and an inspectable safety route.",
};

export default function MentalHealthPage() {
  if (process.env.MENTAL_HEALTH_DEMO_ENABLED === "false") {
    return (
      <main className={styles.unavailable}>
        <span>Voice receptionist demo</span>
        <h1>This experiment is taking a careful pause.</h1>
        <p>
          The demonstration has been disabled by its release owner. No model or
          voice provider was contacted.
        </p>
        <Link href="/">Return to Tutor</Link>
      </main>
    );
  }
  return <MentalHealthDemo />;
}
