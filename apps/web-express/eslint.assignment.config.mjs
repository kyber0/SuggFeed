import tseslint from 'typescript-eslint';
export default tseslint.config({files:['src/lib/assignment/*.ts','src/routes/assignments.ts','src/client/assignments.ts'],extends:[...tseslint.configs.recommended]});
