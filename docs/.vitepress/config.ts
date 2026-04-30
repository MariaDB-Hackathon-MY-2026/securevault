import { execSync } from "node:child_process";
import { defineConfig } from "vitepress";
import type { DefaultTheme } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

const defaultRepoPath = "MariaDB-Hackathon-MY-2026/securevault";
const githubRepository = process.env.GITHUB_REPOSITORY ?? defaultRepoPath;
const currentRepoName = githubRepository.split("/")[1] ?? "securevault";
const isProjectPagesSite = !currentRepoName.endsWith(".github.io");

const getLocalBranch = () => {
  try {
    return execSync("git branch --show-current", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
};

const sourceBranch =
  (process.env.DOCS_SOURCE_BRANCH ??
    process.env.GITHUB_REF_NAME ??
    getLocalBranch()) ||
  "main";
const repoUrl = `https://github.com/${githubRepository}`;
const repoContentBase = `${repoUrl}/blob/${sourceBranch}`;
const repoTreeBase = `${repoUrl}/tree/${sourceBranch}`;

type DocsThemeConfig = DefaultTheme.Config & {
  repoBranch: string;
  repoContentBase: string;
  repoTreeBase: string;
  repoUrl: string;
};

const themeConfig: DocsThemeConfig = {
  nav: [
    { text: "Docs Home", link: "/" },
    { text: "Features", link: "/product/features" },
    { text: "Getting Started", link: "/getting-started/local-development" },
    { text: "Architecture", link: "/architecture/project-handbook" },
    { text: "Security", link: "/security/shared-preview-protection" },
    { text: "API", link: "/reference/api" },
    { text: "GitHub", link: repoUrl },
  ],
  repoUrl,
  repoBranch: sourceBranch,
  repoContentBase,
  repoTreeBase,
  search: {
    provider: "local",
  },
  outline: {
    level: [2, 3],
    label: "On this page",
  },
  darkModeSwitchTitle: "Switch to dark theme",
  lightModeSwitchTitle: "Switch to light theme",
  editLink: {
    pattern: `${repoUrl}/edit/${sourceBranch}/docs/:path`,
    text: "Edit this page on GitHub",
  },
  footer: {
    message: "Built with VitePress and deployed through GitHub Pages.",
    copyright: "Copyright 2026 SecureVault contributors",
  },
  sidebar: [
    {
      text: "Start Here",
      items: [
        { text: "Overview", link: "/" },
        { text: "Feature Tour", link: "/product/features" },
        { text: "Demo Walkthrough", link: "/product/demo-walkthrough" },
        { text: "Local Development", link: "/getting-started/local-development" },
      ],
    },
    {
      text: "Product",
      items: [
        { text: "Feature Tour", link: "/product/features" },
        { text: "Demo Walkthrough", link: "/product/demo-walkthrough" },
        { text: "Security In Plain English", link: "/product/security-plain-english" },
        { text: "UI Showcase", link: "/product/ui-showcase" },
      ],
    },
    {
      text: "Architecture",
      items: [
        { text: "Project Handbook", link: "/architecture/project-handbook" },
        {
          text: "Technical Feature Architecture",
          link: "/architecture/technical-feature-architecture",
        },
        { text: "Upload Queue", link: "/architecture/upload-queue" },
      ],
    },
    {
      text: "Security",
      items: [
        { text: "Shared Preview Protection", link: "/security/shared-preview-protection" },
      ],
    },
    {
      text: "Operations",
      items: [{ text: "Docker and Compose", link: "/operations/docker-compose" }],
    },
    {
      text: "Reference",
      items: [{ text: "API Reference", link: "/reference/api" }],
    },
    {
      text: "Quality",
      items: [
        { text: "Playwright Coverage", link: "/testing/playwright" },
        { text: "Benchmark Workflows", link: "/testing/benchmarks" },
      ],
    },
  ],
  socialLinks: [{ icon: "github", link: repoUrl }],
};

export default withMermaid(
  defineConfig({
    title: "SecureVault",
    description:
      "Product, architecture, API, operations, and testing documentation for SecureVault.",
    srcDir: ".",
    base:
      process.env.GITHUB_ACTIONS && isProjectPagesSite ? `/${currentRepoName}/` : "/",
    lastUpdated: true,
    mermaid: {
      themeVariables: {
        edgeLabelBackground: "#565656",
        tertiaryColor: "#565656",
        tertiaryTextColor: "#ffffff",
      },
    },
    head: [
      ["meta", { name: "theme-color", content: "#0f766e" }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:title", content: "SecureVault Docs" }],
      [
        "meta",
        {
          property: "og:description",
          content:
            "Explore SecureVault's architecture, API surface, Docker workflows, and quality coverage.",
        },
      ],
    ],
    themeConfig,
    vite: {
      build: {
        chunkSizeWarningLimit: 2500,
      },
    },
  }),
);
