import tseslint from 'typescript-eslint';
export default tseslint.config({files:['src/client/animations/**/*.ts'],extends:[...tseslint.configs.recommended],rules:{'@typescript-eslint/no-namespace':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^(SfMotion|Window)$'}],'@typescript-eslint/no-explicit-any':'error'}});
