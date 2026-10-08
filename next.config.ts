import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // PGlite ships a WASM Postgres; it must load from node_modules, not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
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
