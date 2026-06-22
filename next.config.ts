import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  images: {
    // Use the remote IIIF service directly. This preserves responsive image
    // selection without routing every image through Vercel's optimizer.
    loader: 'custom',
    loaderFile: './lib/iiif-loader.ts',
    deviceSizes: [320, 480, 640, 768, 1024, 1280, 1600, 1920],
    imageSizes: [],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'iiif.micr.io',
        pathname: '/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
