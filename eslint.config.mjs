import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { ignores: [".keystone/**", ".next/**", "node_modules/**", "migrations/**"] },
];

export default eslintConfig;
