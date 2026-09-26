import React from 'react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen font-sans antialiased">
        <main className="max-w-3xl mx-auto px-6 py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
