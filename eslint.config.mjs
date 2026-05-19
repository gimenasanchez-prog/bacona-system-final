import next from "@next/eslint-plugin-next";

export default [
  {
    files: ["**/*.{js,cjs,mjs,ts,tsx}"],
    plugins: { "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },
];

