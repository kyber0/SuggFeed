import tseslint from 'typescript-eslint';
export default tseslint.config({files:['src/lib/comment-moderation*.ts','src/lib/comments.ts','src/client/comment-edit.ts'],extends:[...tseslint.configs.recommended],rules:{'@typescript-eslint/no-explicit-any':'error'}});
