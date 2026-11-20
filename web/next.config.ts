import type { NextConfig } from "next";

// BASE_PATH is set by the Pages workflow to "/<repo>" so assets resolve under
// https://<owner>.github.io/<repo>/. Locally it is empty.
const basePath = process.env.BASE_PATH ?? "";
// DATA_URL is set by the Cloudflare build (scripts/cloudflare-build.mjs) to GitHub Pages' /data, so the deploy
// leaves out data/ and stays under Cloudflare's free 20,000-file cap. Unset, data comes from this site.
const dataUrl = process.env.DATA_URL;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath, ...(dataUrl ? { NEXT_PUBLIC_DATA_URL: dataUrl.replace(/\/$/, "") } : {}) },
};

export default nextConfig;
