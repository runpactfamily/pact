import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", ".pact-data/**", "next-env.d.ts", "worker-configuration.d.ts", ".open-next/**", ".wrangler/**"],
  },
];

export default config;
