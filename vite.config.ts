import { defineConfig } from 'vitest/config';
import type { ProxyOptions } from 'vite';
import type { ClientRequest } from 'node:http';
import react from '@vitejs/plugin-react';

const COMFY_TARGET = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const COMFY_ORIGIN = new URL(COMFY_TARGET).origin;

/**
 * The browser only ever talks to one origin. In dev and preview this proxy forwards
 * /comfy/* to the local ComfyUI, which removes the need for CORS on ComfyUI's side.
 *
 * ComfyUI also rejects (403) any request whose Origin header is not its own, and browsers
 * send Origin on POSTs. Rewriting it to the target origin keeps uploads and /prompt working
 * without restarting ComfyUI with extra flags.
 */
const proxy: Record<string, ProxyOptions> = {
  '/comfy': {
    target: COMFY_TARGET,
    changeOrigin: true,
    ws: true,
    rewrite: (path: string) => path.replace(/^\/comfy/, ''),
    configure: (server) => {
      const rewriteOrigin = (request: ClientRequest) => {
        request.setHeader('origin', COMFY_ORIGIN);
        // Browser cookies for localhost belong to the app, not to ComfyUI. Some are larger
        // than aiohttp's 8 KB header limit, which makes ComfyUI answer 400.
        request.removeHeader('cookie');
      };
      server.on('proxyReq', rewriteOrigin);
      server.on('proxyReqWs', rewriteOrigin);
    },
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
    // .dsh-tmp holds logs, npm cache and headless Chrome profiles. Watching it floods the
    // watcher (thousands of files) and can make HMR miss real source edits.
    watch: { ignored: ['**/.dsh-tmp/**', '**/dist/**'] },
  },
  preview: { port: 4173, proxy },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
