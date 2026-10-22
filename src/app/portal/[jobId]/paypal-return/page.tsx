import { ReturnStatus } from "./ReturnStatus";

// Arriving here proves nothing. The page asks the server to verify the order
// with PayPal and capture it; only that result is shown.
export default async function PayPalReturn(props: PageProps<"/portal/[jobId]/paypal-return">) {
  const { jobId } = await props.params;
  const { op } = (await props.searchParams) as { op?: string };
  return (
    <div className="portal">
      <main id="main">
        <h1>Confirming your payment</h1>
        {op && /^[0-9a-f-]{36}$/.test(op) ? <ReturnStatus jobId={jobId} operationId={op} /> : <p className="notice bad">This return link is incomplete. Go back to your review page.</p>}
      </main>
    </div>
  );
}
