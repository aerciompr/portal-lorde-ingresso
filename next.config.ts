import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // cPanel/CloudLinux: node_modules é symlink para nodevenv
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  // cPanel: sem worker separado (EAGAIN nproc) + 1 CPU
  experimental: {
    cpus: 1,
    workerThreads: false,
    webpackBuildWorker: false,
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@tiptap/react',
      '@tiptap/starter-kit',
      'sonner',
      'react-hook-form',
    ],
  },
  webpack: (config) => {
    config.parallelism = 1;
    return config;
  },
};

export default nextConfig;
