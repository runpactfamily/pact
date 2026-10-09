/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Parsers load workers and streams at runtime; bundling them breaks that.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth", "exceljs"],
};

export default nextConfig;
