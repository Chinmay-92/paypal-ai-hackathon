import { StartDealButton } from "./start-deal-button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">SpecLock · PayPal sandbox demo</p>
        <h1 className="text-4xl font-semibold tracking-tight">Pay suppliers for the goods you agreed on, not the goods you get.</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">
          Buyer and supplier lock a cited spec. The buyer authorizes the full order through PayPal and only the
          deposit is captured. Before shipment, a photo challenge and per-field QC decide whether the balance is
          released, discounted, or sent to a human. PayPal&apos;s buyer protection excludes &ldquo;not as described&rdquo;
          claims on custom-made goods, so the check has to happen before the money moves.
        </p>
      </div>
      <StartDealButton />
    </main>
  );
}
