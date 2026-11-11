import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@chromebook/shared"],
  poweredByHeader: false,
};

export default nextConfig;
