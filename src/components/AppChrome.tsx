"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname === "/login";

  if (hideChrome) return <>{children}</>;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </>
  );
}
