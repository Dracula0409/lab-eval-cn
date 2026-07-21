// By default, @monaco-editor/react fetches Monaco's JS/CSS from a public
// CDN (cdn.jsdelivr.net) at runtime, even though `monaco-editor` is already
// a local dependency. On networks that block/throttle external CDNs (campus
// wifi, exam lockdown networks, firewalls) that fetch just hangs — the
// editor is stuck on its default "Loading..." placeholder forever, with no
// timeout or error shown, while the rest of the app (same-origin API calls)
// works fine.
//
// This points the loader at the bundled npm package instead, so Monaco is
// served from our own build and never depends on reaching a third-party CDN.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Monaco needs web workers for things like tokenization/basic editing
// features. Wire them up via Vite's native `new URL(..., import.meta.url)`
// worker syntax so no extra bundler plugin is required.
self.MonacoEnvironment = {
  getWorker() {
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' }
    );
  },
};

loader.config({ monaco });