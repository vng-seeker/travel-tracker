import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/photos": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/thumbnails": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/face_crops": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
