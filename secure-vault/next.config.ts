import type { NextConfig } from "next";
import {Header} from "next/dist/lib/load-custom-routes";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  headers(){
    const header:Header[] = [
      {
        headers: [
          {key: "X-Content-Type-Options", value: "nosniff"},
          {key: "X-Frame-Options", value: "DENY"},
          {key: "X-XSS-Protection", value: "1; mode=block"},
          {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; frame-src 'none';",
          },
        ],
        source: '/(.*)' //applied for all route
      }
    ]
    return header
  }
};

export default nextConfig;
