import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Avoid picking a parent folder when multiple package-lock.json files exist on the machine.
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["pdf-parse", "sharp", "tesseract.js"],
};

export default nextConfig;
