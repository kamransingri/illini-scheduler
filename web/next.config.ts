import type { NextConfig } from "next";

// BASE_PATH is set by the Pages workflow to "/<repo>" so assets resolve under
// https://<owner>.github.io/<repo>/. Locally it is empty.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
