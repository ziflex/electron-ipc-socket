import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'docs/**',
            'lib/**',
            'node_modules/**',
            '.idea/**',
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            globals: {
                AbortController: 'readonly',
                Response: 'readonly',
                URL: 'readonly',
                clearTimeout: 'readonly',
                process: 'readonly',
                setTimeout: 'readonly',
            },
        },
    },
);
