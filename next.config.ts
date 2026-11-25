import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes com binários nativos ou que leem arquivos do disco ficam fora do bundle.
  serverExternalPackages: ["sharp", "heic-convert", "unpdf"],
  poweredByHeader: false,
  experimental: {
    // Fotos e PDFs escaneados podem ser grandes (limite por arquivo: 30 MB, ver rota de upload).
    proxyClientMaxBodySize: "35mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
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
