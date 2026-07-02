import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["**/node_modules/", "client/dist/", "server/data/"] },

  js.configs.recommended,

  // Client: React + browser
  {
    files: ["client/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Intentional "// CODE — TITLE" design aesthetic in headings
      "react/jsx-no-comment-textnodes": "off",
      // Plain apostrophes in prose are fine
      "react/no-unescaped-entities": "off",
      // React Compiler-readiness rules (hooks plugin v7) — advisory until we adopt the compiler
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Client build config runs in Node
  {
    files: ["client/vite.config.js"],
    languageOptions: { globals: globals.node },
  },

  // Server: Node
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Root config files
  {
    files: ["*.js"],
    languageOptions: { globals: globals.node },
  },
];
