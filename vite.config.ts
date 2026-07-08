import { defineConfig } from "vite";

// base relatif ("./") : les assets fonctionnent aussi bien à la racine d'un
// domaine que dans un sous-chemin GitHub Pages (https://user.github.io/repo/).
export default defineConfig({
  base: "./",
});
