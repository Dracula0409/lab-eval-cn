import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Monaco's Safari handler assumes navigator.clipboard.write and
  // ClipboardItem exist. They do not on HTTP Safari/WebKit deployments; its
  // own writeText fallback already handles that case, so only install the
  // special handler when the required APIs are truly available.
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
  plugins: [
    react(),
    {
      name: 'guard-monaco-webkit-clipboard',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('/monaco-editor/esm/vs/platform/clipboard/browser/clipboardService.js')) {
          return null;
        }

        return code.replace(
          'if (isSafari || isWebkitWebView) {\n            this.installWebKitWriteTextWorkaround();\n        }',
          'if ((isSafari || isWebkitWebView) && typeof navigator.clipboard?.write === \'function\' && typeof ClipboardItem === \'function\') {\n            this.installWebKitWriteTextWorkaround();\n        }'
        );
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: [''],
    port: 5173
  }
})
