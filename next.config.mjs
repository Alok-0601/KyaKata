/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdf.js optionally requires canvas (Node only); not needed in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
