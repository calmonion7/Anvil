import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// 개발: 화면(vite)이 /api·/ws와 첫 주소(/?token=)를 Node 서버(server/main.js)로 넘긴다. 인증은 서버와 똑같이
// ?token= 주소로 받은 쿠키뿐이다 — 프록시는 토큰을 붙이지 않는다(Origin·Host는 브라우저 밖에서 얼마든지 위조된다).
// 서버는 자기 Origin만 받으므로 이 개발 화면에서 온 요청의 Origin만 서버 것으로 바꾼다.
// 다른 출처·다른 Host(DNS 리바인딩)에서 온 요청은 그대로 넘겨 서버가 거절한다.
const SERVER = `http://127.0.0.1:${process.env.ANVIL_PORT || 4517}`;
/** @param {any} proxyReq @param {any} req */
function toServer(proxyReq, req) {
  const { origin, host } = req.headers;
  if (/^(127\.0\.0\.1|localhost):\d+$/.test(host) && origin === `http://${host}`) proxyReq.setHeader("origin", SERVER);
}
const toNode = {
  target: SERVER,
  changeOrigin: true,
  /** @param {any} proxy */
  configure: (proxy) => {
    proxy.on("proxyReq", toServer);
    proxy.on("proxyReqWs", toServer);
  },
};

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [sveltekit()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // LAN에 여는 tauri 개발(TAURI_DEV_HOST)에는 서버로 가는 길을 내지 않는다. preview도 이 설정을 물려받는다.
    proxy: host
      ? undefined
      : {
          "^/\\?token=": toNode, // 서버가 토큰을 확인하고 이 주소(vite)에 쿠키를 심은 뒤 /로 보낸다
          "/api": toNode,
          "/ws": { ...toNode, ws: true },
        },
  },
}));
