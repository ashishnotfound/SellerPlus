import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const compat = new FlatCompat({ baseDirectory: dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "public/workbox-*.js",
      "public/fallback-*.js",
      "public/swe-worker-*.js",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Existing UI copy contains contractions and quoted examples. This is
      // a stylistic JSX rule, not a runtime or security boundary.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
