import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.vercel.app",
      },
      {
        protocol: "https",
        hostname: "**.vercel.app",
      },
    ],
  },
  turbopack: {
    /** Явний корінь проєкту — не піднімаємось до `C:\Users\broki\package-lock.json`. */
    root: path.join(__dirname),
  },
};

export default nextConfig;
