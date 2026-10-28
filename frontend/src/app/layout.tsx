import React from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReSector",
  description: "A research workspace for reading, questioning and connecting papers.",
};

// Runs before first paint so people who chose dark never see a light flash on launch.
const themeInit = `(function(){try{var t=localStorage.getItem("resector_theme")==="dark"?"dark":"light";var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",t==="dark");}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
