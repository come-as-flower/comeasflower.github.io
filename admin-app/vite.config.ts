import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// 상대 base는 사용자/조직 Pages, project Pages, 커스텀 도메인 모두에서 작동합니다.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: '../admin', emptyOutDir: true },
});
