<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

const props = withDefaults(
  defineProps<{
    path: string;
    kind?: "blob" | "tree";
    text?: string;
  }>(),
  {
    kind: "blob",
  },
);

const { theme } = useData();

const href = computed(() => {
  const themeConfig = theme.value as {
    repoUrl?: string;
    repoBranch?: string;
    repoContentBase?: string;
    repoTreeBase?: string;
  };
  const fallbackRepoUrl =
    themeConfig.repoUrl ?? "https://github.com/MariaDB-Hackathon-MY-2026/securevault";
  const fallbackRepoBranch = themeConfig.repoBranch ?? "main";
  const repoBase =
    props.kind === "tree"
      ? themeConfig.repoTreeBase ?? `${fallbackRepoUrl}/tree/${fallbackRepoBranch}`
      : themeConfig.repoContentBase ?? `${fallbackRepoUrl}/blob/${fallbackRepoBranch}`;

  return `${repoBase}/${props.path}`;
});

const label = computed(() => props.text ?? props.path);
</script>

<template>
  <a :href="href" class="repo-link" target="_blank" rel="noreferrer">
    <code>{{ label }}</code>
  </a>
</template>
