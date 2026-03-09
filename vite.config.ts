import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        chunkSizeWarningLimit: 800,
        rollupOptions: {
          output: {
            manualChunks(id) {
              const normalizedId = id.replace(/\\/g, '/');

              if (normalizedId.includes('/src/features/visualizer/')) {
                return 'feature-visualizer';
              }

              if (normalizedId.includes('/src/features/urdf-viewer/')) {
                return 'feature-urdf-viewer';
              }

              if (normalizedId.includes('/src/features/property-editor/')) {
                return 'feature-property-editor';
              }

              if (normalizedId.includes('/src/features/code-editor/')) {
                return 'feature-code-editor';
              }

              if (normalizedId.includes('/src/features/ai-assistant/')) {
                return 'feature-ai-assistant';
              }

              if (normalizedId.includes('/src/features/file-io/')) {
                return 'feature-file-io';
              }

              if (normalizedId.includes('/src/features/assembly/')) {
                return 'feature-assembly';
              }

              if (normalizedId.includes('/src/features/robot-tree/')) {
                return 'feature-robot-tree';
              }

              if (normalizedId.includes('/src/core/parsers/')) {
                return 'core-parsers';
              }

              if (!normalizedId.includes('/node_modules/')) return;

              if (normalizedId.includes('/@react-three/drei/')) {
                return 'drei-vendor';
              }

              if (normalizedId.includes('/@react-three/fiber/')) {
                return 'r3f-vendor';
              }

              if (normalizedId.includes('/three/examples/') || normalizedId.includes('/three-stdlib/')) {
                return 'three-addons';
              }

              if (normalizedId.includes('/three/')) {
                return 'three-core';
              }

              if (normalizedId.includes('monaco-editor') || normalizedId.includes('@monaco-editor')) {
                return 'editor-vendor';
              }

              if (
                normalizedId.includes('/react-syntax-highlighter/') ||
                normalizedId.includes('/react-simple-code-editor/') ||
                normalizedId.includes('/prismjs/')
              ) {
                return 'code-vendor';
              }

              if (normalizedId.includes('/jspdf/') || normalizedId.includes('/jszip/')) {
                return 'export-vendor';
              }

              if (normalizedId.includes('/lucide-react/')) {
                return 'icon-vendor';
              }

              if (normalizedId.includes('/zustand/') || normalizedId.includes('/immer/')) {
                return 'state-vendor';
              }

              if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/') || normalizedId.includes('/scheduler/')) {
                return 'react-vendor';
              }
            },
          },
        },
      },
      worker: {
        format: 'es',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.OPENAI_API_KEY || env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.OPENAI_API_KEY),
        'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
        'process.env.OPENAI_BASE_URL': JSON.stringify(env.OPENAI_BASE_URL),
        'process.env.OPENAI_MODEL': JSON.stringify(env.OPENAI_MODEL)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
