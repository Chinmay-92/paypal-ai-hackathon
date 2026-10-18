import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadDeal } from "@/lib/deal/store";
import { DealView } from "./deal-view";

export default function DealPage(props: PageProps<"/deals/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-neutral-500">Loading deal…</p>}>
      <DealLoader {...props} />
    </Suspense>
  );
}

async function DealLoader(props: PageProps<"/deals/[id]">) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const deal = await loadDeal(id);
  if (!deal) notFound();
  const payment = typeof search.payment === "string" ? search.payment : null;
  const reason = typeof search.reason === "string" ? search.reason : null;
  return <DealView initial={deal} paymentResult={payment} paymentReason={reason} />;
}
