import tseslint from 'typescript-eslint';
export default tseslint.config({files:['src/lib/assistant/*.ts','src/routes/assistant*.ts','src/client/assistant*.ts'],extends:[...tseslint.configs.recommended],rules:{'@typescript-eslint/no-explicit-any':'error'}});
