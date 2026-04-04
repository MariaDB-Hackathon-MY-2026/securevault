import type { NextConfig } from "next";
import { Header } from "next/dist/lib/load-custom-routes";

const isDevelopment = process.env.NODE_ENV !== "production";
function buildContentSecurityPolicy(frameAncestors: string) {
  return [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${frameAncestors}`,
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: ws: wss:",
  ].join("; ");
}

const contentSecurityPolicy = buildContentSecurityPolicy("'none'");
const previewContentSecurityPolicy = buildContentSecurityPolicy("'self'");

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  reactCompiler: true,
  headers() {
    const header: Header[] = [
      {
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: previewContentSecurityPolicy,
          },
        ],
        source: "/api/files/:id/preview",
      },
      {
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: previewContentSecurityPolicy,
          },
        ],
        source: "/api/share/:token/preview",
      },
      {
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
        source: "/((?!api/files/[^/]+/preview$|api/share/[^/]+/preview$).*)",
      },
    ];

    return header;
  },
};

export default nextConfig;
