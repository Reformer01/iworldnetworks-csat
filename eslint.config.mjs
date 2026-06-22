import nextEslintConfig from "eslint-config-next";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = [
  ...nextEslintConfig,
  eslintConfigPrettier,
];

export default eslintConfig;
