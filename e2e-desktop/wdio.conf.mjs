// 실제 Anvil 앱을 tauri-driver(WebDriver)로 띄운다. macOS에는 tauri-driver가 없어 돌지 않는다(README '개발' 참고).
// 환경 변수: ANVIL_BIN(빌드한 앱) · TAURI_DRIVER(없으면 PATH의 tauri-driver) · NATIVE_DRIVER(윈도우 msedgedriver) · E2E_OUT(스크린샷·로그 폴더)
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const out = process.env.E2E_OUT || path.resolve("out");
let driver;

/** tauri-driver가 4444를 열 때까지 기다린다 */
const listening = () =>
  new Promise((resolve) => {
    const s = net.connect(4444, "127.0.0.1", () => (s.destroy(), resolve(true)));
    s.on("error", () => resolve(false));
  });

export const config = {
  runner: "local",
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./specs/*.mjs"],
  maxInstances: 1,
  capabilities: [{ maxInstances: 1, "tauri:options": { application: process.env.ANVIL_BIN } }],
  logLevel: "warn",
  reporters: ["spec"],
  framework: "mocha",
  // 설치 단계가 네트워크로 node·claude·forge를 받는다
  mochaOpts: { ui: "bdd", timeout: 15 * 60 * 1000 },
  async beforeSession() {
    fs.mkdirSync(out, { recursive: true });
    // 앱의 표준 출력·오류는 tauri-driver를 거쳐 여기로
    const log = fs.openSync(path.join(out, "app.log"), "a");
    const args = process.env.NATIVE_DRIVER ? ["--native-driver", process.env.NATIVE_DRIVER] : [];
    // 작업 프로세스의 NODE_OPTIONS(--import 로더)가 앱 → 앱이 띄우는 node·claude로 새지 않게
    const env = { ...process.env, NODE_OPTIONS: undefined };
    driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", args, { env, stdio: ["ignore", log, log] });
    for (let i = 0; i < 50 && !(await listening()); i++) await new Promise((r) => setTimeout(r, 200));
  },
  afterSession() {
    driver?.kill();
  },
};
