import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' để chạy được dưới /<tên-repo>/ trên GitHub Pages mà không cần sửa gì.
// App dùng hash routing (#/g/...) nên không bị lỗi 404 khi tải lại trang.
export default defineConfig({
  plugins: [react()],
  base: './',
})
