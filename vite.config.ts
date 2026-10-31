import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths, so the build works under the GitHub Pages /<repo>/ path.
  base: "./",
  plugins: [preact(), tailwindcss()],
});
