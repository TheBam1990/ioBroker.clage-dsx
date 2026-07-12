import config from "@iobroker/eslint-config";

export default [
  ...config,
  {
    rules: {
      "@typescript-eslint/no-this-alias": "off",
    },
  },
  {
    files: ["main.test.js", "test/**/*.js"],
    languageOptions: {
      globals: {
        after: "readonly",
        before: "readonly",
        describe: "readonly",
        it: "readonly",
      },
    },
  },
];
