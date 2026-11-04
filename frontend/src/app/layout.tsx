import React from "react";
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReSector",
  description: "A research workspace for reading, questioning and connecting papers.",
};

// Runs before first paint: no flash of the wrong theme, and the chosen text size is applied at once.
// With no saved choice the theme follows the computer's light/dark setting.
const themeInit = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("resector_theme");var dark=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.dataset.theme=dark?"dark":"light";d.classList.toggle("dark",dark);var x=localStorage.getItem("resector_text");if(x==="large"||x==="xlarge")d.dataset.text=x;}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="resector-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
