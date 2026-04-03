export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/tmp/**',
    '**/.tmp/**',
    '**/output/**',
    'public/**',
  ],
  rules: {
    'alpha-value-notation': null,
    'at-rule-empty-line-before': null,
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['custom-variant', 'theme'],
      },
    ],
    'color-function-alias-notation': null,
    'color-function-notation': null,
    'color-hex-length': null,
    'custom-property-empty-line-before': null,
    'declaration-empty-line-before': null,
    'import-notation': null,
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    'property-no-vendor-prefix': null,
    'selector-class-pattern': null,
    'selector-attribute-quotes': null,
  },
};
