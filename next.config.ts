import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes com binários nativos ou que leem arquivos do disco ficam fora do bundle.
  serverExternalPackages: ["sharp", "heic-convert", "unpdf"],
  poweredByHeader: false,
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
