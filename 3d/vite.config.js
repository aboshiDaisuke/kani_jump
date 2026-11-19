import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 相対パスにして、どのサブディレクトリに置いても動くようにする
  base: './',
  build: {
    assetsInlineLimit: 0, // glb をインライン化せずファイルのままキャッシュさせる
    chunkSizeWarningLimit: 1000, // three.js を含むため
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'img/*.jpg'],
      manifest: {
        name: 'カニジャンプ',
        short_name: 'カニジャンプ',
        description: '横断歩道のカニを操って、迫ってくる車をジャンプと横歩きでかわす 3D ゲーム',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        background_color: '#47a8fd',
        theme_color: '#47a8fd',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,webp,woff2,glb}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
