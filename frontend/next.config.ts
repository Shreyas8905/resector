import type { NextConfig } from "next";

// Desktop build (desktop/scripts/build-frontend.mjs sets DESKTOP_BUILD=1): a static export that the
// backend serves itself. Web, Docker and `npm run dev` are unaffected.
const desktop = process.env.DESKTOP_BUILD === "1";

const nextConfig: NextConfig = desktop
  ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
  : {};

export default nextConfig;