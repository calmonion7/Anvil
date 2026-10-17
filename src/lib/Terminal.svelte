<script lang="ts" module>
  let counter = 0;
</script>

<script lang="ts">
  import { invoke, Channel } from "@tauri-apps/api/core";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { onMount } from "svelte";

  /** 살아 있는 tmux 세션 이름 — 이 컴포넌트는 pty 안에서 그 세션에 붙기만 한다. */
  let { name }: { name: string } = $props();

  let host: HTMLDivElement;

  onMount(() => {
    const id = ++counter;
    const term = new Terminal({
      fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 0, // 스크롤백은 tmux(history-limit 50000)가 맡는다
      theme: { background: "#111110", foreground: "#e6e5e0", cursor: "#e6e5e0", selectionBackground: "#3987e566" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const onData = new Channel<string>();
    onData.onmessage = (s) => term.write(s);
    invoke("term_open", { id, name, cols: term.cols, rows: term.rows, onData }).catch((e) =>
      term.write(`\r\n[세션에 붙지 못했습니다: ${e}]\r\n`),
    );
    const send = (d: string) => invoke("term_write", { id, data: d });

    // 한글 IME: WKWebView는 한글에 composition 이벤트를 보내지 않고, 입력 칸의 글자를 바꿔치기한다.
    //   ㅎ(insertText) → 호 → 화 → 확(insertReplacementText) → 다음 음절 ㅇ(insertText) …
    // xterm.js는 첫 insertText만 보내고 바꿔치기를 무시해 「ㅎ ㅇ」처럼 떨어져 들어간다.
    // 그래서 이 두 input 이벤트를 직접 해석한다: 새 음절은 그대로 보내고, 바꿔치기는 직전에 보낸
    // 글자 수만큼 DEL로 지운 뒤 새 글자를 보낸다. IME 입력 중(keyCode 229 이후)에 xterm이 따로
    // 보내는 한글은 버린다. 붙여넣기(Cmd+V)는 229가 아니라 한글이 그대로 통과한다.
    const HANGUL_ONLY = /^[ᄀ-ᇿ㄰-㆏가-힯]+$/;
    /** 지금 조합 중이라 바꿔치기될 수 있는, 이미 터미널에 보낸 글자 */
    let composing = "";
    /** 마지막 키가 IME 키(229)였는가 */
    let ime = false;
    const erase = (s: string) => "\x7f".repeat([...s].length);
    const onInput = (e: Event) => {
      const { inputType, data } = e as InputEvent;
      if (inputType === "insertText" && ime && data && HANGUL_ONLY.test(data)) {
        composing = data;
        send(data);
      } else if (inputType === "insertReplacementText" && composing) {
        send(erase(composing) + (data ?? ""));
        composing = data ?? "";
      } else if (inputType === "deleteContentBackward" && composing) {
        send(erase(composing));
        composing = "";
      }
    };
    // IME가 아닌 키(띄어쓰기·Enter·방향키 등, keyCode≠229)가 오면 조합이 끝난 것이다.
    const onKey = (e: KeyboardEvent) => {
      ime = e.keyCode === 229;
      if (!ime) composing = "";
    };
    host.addEventListener("input", onInput, true);
    host.addEventListener("keydown", onKey, true);
    const input = term.onData((d) => {
      if (ime && HANGUL_ONLY.test(d)) return;
      send(d);
    });

    const ro = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      fit.fit();
      invoke("term_resize", { id, cols: term.cols, rows: term.rows });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      input.dispose();
      host.removeEventListener("input", onInput, true);
      host.removeEventListener("keydown", onKey, true);
      invoke("term_close", { id });
      term.dispose();
    };
  });
</script>

<div class="host" bind:this={host}></div>

<style>
  .host { flex: 1; min-height: 0; padding: 4px 8px; background: #111110; }
  .host :global(.xterm) { height: 100%; }
</style>
