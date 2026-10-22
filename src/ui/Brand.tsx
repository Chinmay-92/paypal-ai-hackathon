import Link from "next/link";

export function Brand({ href = "/", name = "Pact" }: { href?: string | null; name?: string }) {
  const inner = (
    <>
      <span className="brand-mark" aria-hidden="true" />
      {name}
    </>
  );
  return href ? (
    <Link className="brand" href={href}>
      {inner}
    </Link>
  ) : (
    <span className="brand">{inner}</span>
  );
}
