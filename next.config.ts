import type { NextConfig } from "next";
import path from "path";

/** Build no Docker/EasyPanel — imagem standalone + build mais rápido */
const isDockerBuild = process.env.DOCKER_BUILD === "1";

const nextConfig: NextConfig = {
  // cPanel/CloudLinux: node_modules é symlink para nodevenv
  outputFileTracingRoot: path.join(__dirname),

  // Docker: só o necessário na imagem (export ~10x menor/mais rápido)
  ...(isDockerBuild ? { output: "standalone" as const } : {}),

  // Docker: typecheck roda no CI/local (`npm run typecheck`) — no VPS economiza ~3 min
  // (Next 16: não usar key `eslint` em next.config — gera warning)
  ...(isDockerBuild
    ? {
        typescript: { ignoreBuildErrors: true },
      }
    : {}),

  // Prisma engines no standalone (file tracing)
  outputFileTracingIncludes: isDockerBuild
    ? {
        "/*": [
          "./node_modules/.prisma/**/*",
          "./node_modules/@prisma/client/**/*",
        ],
      }
    : undefined,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  experimental: {
    // cPanel: 1 CPU (EAGAIN). Docker/VPS: deixa o Next usar os cores disponíveis
    ...(isDockerBuild
      ? {}
      : {
          cpus: 1,
          workerThreads: false,
          webpackBuildWorker: false,
        }),
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "sonner",
      "react-hook-form",
    ],
  },

  webpack: isDockerBuild
    ? undefined
    : (config) => {
        config.parallelism = 1;
        return config;
      },
};

export default nextConfig;
