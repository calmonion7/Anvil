// 깨끗한 Ubuntu 22.04(node·tmux·claude 없음) — 준비물 띠 → [설치] → 세션 열기
import assert from "node:assert/strict";
import { bandGone, bandText, installAll, korean, openSession, step, xfail } from "../helpers.mjs";

describe("Linux 깨끗한 PC", () => {
  before(korean);

  step("① 띠에 node · claude · forge 필요 표시", async () => {
    const text = await bandText();
    for (const w of ["node", "claude", "forge"]) assert.ok(text.includes(w), `'${w}' 없음: ${text}`);
  });
  xfail("② [설치] → 모든 항목 설치", installAll);
  xfail("③ 준비물 띠 사라짐", bandGone);
  xfail("④ [세션 열기] → 터미널에 claude 첫 화면", openSession);
});
