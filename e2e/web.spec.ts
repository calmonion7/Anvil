import { test, expect } from "@playwright/test";
import { mockIpc } from "./mock-ipc";

// 브라우저 탭으로 옮기며 새로 생긴 것 — 탭 제목의 입력 대기 표시 · 폴더 고르기 · 터미널 웹소켓 (Node 전환 1/4 S5)

test("입력 대기 세션이 있으면 탭 제목에 🔔, 없어지면 지운다", async ({ page }) => {
  const ipc = await mockIpc(page);
  await page.goto("/");
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
  await expect(page).toHaveTitle("Anvil");
  await ipc.emit("sessions", { "/p/empty-run": { state: "waiting", sessionId: null, alive: true } });
  await expect(page).toHaveTitle("🔔 Anvil");
  await ipc.emit("sessions", { "/p/empty-run": { state: "working", sessionId: null, alive: true } });
  await expect(page).toHaveTitle("Anvil");
});

test("[프로젝트 추가]: 고른 폴더를 등록한다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.pick = "/p/picked";
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 프로젝트 추가" }).click();
  await expect.poll(() => ipc.calls.find((c) => c.cmd === "add_project")?.args).toEqual({ path: "/p/picked" });
});

test("[프로젝트 추가]: 폴더 창이 없는 OS면 화면 안 입력칸으로 경로를 받는다(Electron은 prompt()가 없다)", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.pick = { unsupported: true };
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 프로젝트 추가" }).click();
  const ask = page.getByRole("dialog", { name: "프로젝트 추가" });
  const add = ask.getByRole("button", { name: "추가", exact: true });
  await expect(add).toBeDisabled();
  await ask.getByLabel("프로젝트 폴더의 절대 경로").fill("  /p/typed ");
  await add.click();
  await expect.poll(() => ipc.calls.find((c) => c.cmd === "add_project")?.args).toEqual({ path: "/p/typed" });
  await expect(ask).toBeHidden();
});

test("[프로젝트 추가]: 경로 입력칸은 Esc로 닫히고 아무것도 등록하지 않는다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.pick = { unsupported: true };
  await page.goto("/");
  await page.getByRole("button", { name: "＋ 프로젝트 추가" }).click();
  const ask = page.getByRole("dialog", { name: "프로젝트 추가" });
  await ask.getByLabel("프로젝트 폴더의 절대 경로").fill("/p/typed");
  await page.keyboard.press("Escape");
  await expect(ask).toBeHidden();
  expect(ipc.calls.some((c) => c.cmd === "add_project")).toBe(false);
});

test("세션 터미널은 웹소켓으로 붙고, 받은 출력을 그리고, 입력을 보낸다", async ({ page }) => {
  const ipc = await mockIpc(page);
  await page.goto("/");
  await ipc.emit("sessions", { "/p/alpha-plan": { state: "idle", sessionId: null, alive: true } });
  await expect.poll(() => ipc.sent.find((m) => m.type === "term_open")).toMatchObject({ name: "/p/alpha-plan" });
  const { id } = ipc.sent.find((m) => m.type === "term_open");
  await ipc.send({ type: "term", id, data: "hello-from-pty" });
  await expect(page.locator(".term-plan .xterm-rows")).toContainText("hello-from-pty");
  await page.locator(".term-plan .xterm-helper-textarea").focus();
  await page.keyboard.type("x");
  await expect.poll(() => ipc.sent.find((m) => m.type === "term_write")).toMatchObject({ id, data: "x" });
});

// 브라우저(Chromium)는 한글도 composition 이벤트로 조합한다 — WKWebView용 바꿔치기 해석이 끼어들면 글자가 사라진다
test("한글 조합 입력(composition)이 그대로 들어간다", async ({ page }) => {
  const ipc = await mockIpc(page);
  await page.goto("/");
  await ipc.emit("sessions", { "/p/alpha-plan": { state: "idle", sessionId: null, alive: true } });
  await page.locator(".term-plan .xterm-helper-textarea").focus();
  const cdp = await page.context().newCDPSession(page);
  for (const text of ["ㅎ", "하", "한"]) await cdp.send("Input.imeSetComposition", { text, selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.insertText", { text: "한" });
  const typed = () => ipc.sent.filter((m) => m.type === "term_write").map((m) => m.data).join("");
  await expect.poll(typed).toBe("한");
});

// 문서는 남의 저장소 내용이다 — 그 안의 스크립트가 Anvil 출처에서 돌면 /api·/ws 전권을 얻는다
test("문서(.md) 안의 HTML 스크립트는 실행되지 않는다", async ({ page }) => {
  const ipc = await mockIpc(page);
  ipc.doc = '# 덫\n\n<img src="x" onerror="window.__xss = 1">\n\n<a id="js" href="javascript:window.__xss = 2">링크</a>\n';
  await page.goto("/");
  await page.getByRole("button", { name: "plan", exact: true }).click();
  const doc = page.getByRole("dialog");
  await expect(doc).toContainText("덫");
  const link = doc.locator("#js");
  if (await link.count()) await link.click();
  await page.waitForTimeout(300); // onerror는 이미지 실패 직후 돈다
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
});

// 서버는 실행마다 새 토큰을 만든다 — 다시 뜬 서버엔 옛 쿠키로 붙을 수 없으니, 헛된 재접속 대신 다시 열라고 알린다
test("서버가 다시 시작되면(401) 재접속을 멈추고 주소를 다시 열라고 알린다", async ({ page }) => {
  const ipc = await mockIpc(page);
  await page.goto("/");
  await expect(page.locator('[data-node="backlog"]')).toBeVisible();
  await expect.poll(() => ipc.connects).toBe(1);
  await ipc.restart();
  await expect(page.getByText("서버가 다시 시작되었습니다")).toBeVisible();
  const n = ipc.connects;
  await page.waitForTimeout(3000);
  expect(ipc.connects - n).toBeLessThanOrEqual(1);
});
