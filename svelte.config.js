// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    // 문서(.md)는 남의 저장소 내용을 HTML로 그린다 — 그 안의 인라인 스크립트·onerror=·javascript: 링크가 돌지 않게
    // 스크립트는 우리 파일과 SvelteKit 시작 스크립트(해시)만. 나머지 CSP(frame-ancestors 등)는 서버 응답 헤더(server/http.js).
    csp: { mode: "hash", directives: { "script-src": ["self"] } },
  },
};

export default config;
