import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'images1.apartments.com',
      },
      {
        protocol: 'https',
        hostname: 'images2.apartments.com',
      },
      {
        protocol: 'https',
        hostname: 'images3.apartments.com',
      },
      {
        protocol: 'https',
        hostname: '*.apartments.com',
      },
      {
        protocol: 'https',
        hostname: 'photos.zillowstatic.com',
      },
      {
        protocol: 'https',
        hostname: '*.zillowstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'www.zillow.com',
      }
    ],
  },
};

export default nextConfig;