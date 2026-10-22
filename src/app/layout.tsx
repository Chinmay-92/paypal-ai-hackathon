import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pact — Changes agreed. Work aligned.",
  description: "Coordinate customer amendments into approved revisions, correct PayPal payments and current job instructions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
