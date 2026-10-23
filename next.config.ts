import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deploy em VPS: build autocontido em .next/standalone (ver deploy/DEPLOY.md)
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
