import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    ignores: ['node_modules/', '.next/', 'public/'],
  },
]

export default eslintConfig