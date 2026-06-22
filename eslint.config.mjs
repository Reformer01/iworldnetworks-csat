import nextEslintConfig from "eslint-config-next";

const eslintConfig = [
  ...nextEslintConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];

export default eslintConfig;
