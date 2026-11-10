const MESSAGES: Record<string, string> = {
  replaced: "There’s a newer version of this agreement. Ask the business for an updated link.",
  expired: "This review link has expired. Ask the business for a new one.",
  invalid: "This review link is not valid.",
};

export default async function LinkProblem(props: PageProps<"/portal/link">) {
  const { reason = "invalid" } = (await props.searchParams) as { reason?: string };
  return (
    <div className="portal">
      <main id="main">
        <h1>Review link</h1>
        <p className="notice warn">{MESSAGES[reason] ?? MESSAGES.invalid}</p>
      </main>
    </div>
  );
}
