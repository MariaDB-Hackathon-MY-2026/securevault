<script setup lang="ts">
import DefaultTheme from "vitepress/theme";

import HomeHeroVisual from "./components/HomeHeroVisual.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <HomeHeroVisual />
    </template>
  </Layout>
</template>
