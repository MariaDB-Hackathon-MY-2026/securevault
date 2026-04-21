import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import RepoLink from "./components/RepoLink.vue";

import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("RepoLink", RepoLink);
  },
} satisfies Theme;
