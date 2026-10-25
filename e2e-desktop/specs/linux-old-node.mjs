// Ubuntu 22.04 + `apt install nodejs git`(node v12) — 옛 node는 없는 것으로 치고, [설치] 뒤에도 사용자 node는 그대로
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { bandText, installAll, korean, step } from "../helpers.mjs";

// 하네스의 NODE_OPTIONS(--import)를 빼야 옛 node가 뜬다
const sh = (cmd) => execSync(`bash -lc '${cmd}'`, { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: undefined } }).trim();

describe("Linux 옛 node(v12)", () => {
  before(korean);

  step("① 띠에 'node 22 이상' 필요 표시", async () => {
    assert.match(await bandText(), /node 22/);
  });
  step("② [설치] → 모든 항목 설치", installAll);
  step("③ 사용자 셸의 node는 그대로 v12", async () => {
    const v = sh("node --version");
    console.log(`사용자 node: ${v}`);
    assert.match(v, /^v12\./);
  });
  step("④ Anvil 전용 node는 v22", async () => {
    assert.match(sh("~/.local/share/anvil/node/bin/node --version"), /^v22\./);
  });
});
