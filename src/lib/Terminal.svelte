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

    // 한글 IME: WKWebView에서 xterm.js가 조합 중인 자모를 그대로 보내 「ㅎ ㅇ」처럼 떨어져 들어간다.
    // 한글은 xterm 경로에서 걸러 내고, IME가 조합을 끝낸 글자(compositionend)만 직접 보낸다.
    const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/g;
    const ta = term.textarea!;
    // [임시 진단] 이벤트 순서를 앱 데이터 ime-debug.log에 남긴다 — 한글 입력 확인 뒤 지운다.
    const log = (s: string) => invoke("ime_log", { line: s });
    const onKey = (e: KeyboardEvent) => log(`keydown key=${e.key} code=${e.keyCode} composing=${e.isComposing}`);
    const onCompStart = (e: CompositionEvent) => log(`compositionstart data=${e.data}`);
    const onCompUpdate = (e: CompositionEvent) => log(`compositionupdate data=${e.data}`);
    const onCompEnd = (e: CompositionEvent) => {
      log(`compositionend data=${e.data}`);
      const text = (e.data ?? "").match(HANGUL)?.join("");
      if (text) send(text);
    };
    const onInput = (e: Event) => {
      const ie = e as InputEvent;
      log(`input type=${ie.inputType} data=${ie.data} composing=${ie.isComposing}`);
      // 조합 없이 바로 확정된 한글(드묾)은 여기서 보낸다.
      if (ie.inputType === "insertText" && !ie.isComposing && ie.data) {
        const text = ie.data.match(HANGUL)?.join("");
        if (text) send(text);
      }
    };
    ta.addEventListener("keydown", onKey, true);
    ta.addEventListener("compositionstart", onCompStart, true);
    ta.addEventListener("compositionupdate", onCompUpdate, true);
    ta.addEventListener("compositionend", onCompEnd, true);
    ta.addEventListener("input", onInput, true);
    const input = term.onData((d) => {
      log(`xterm onData ${JSON.stringify(d)}`);
      const rest = d.replace(HANGUL, "");
      if (rest) send(rest);
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
      ta.removeEventListener("keydown", onKey, true);
      ta.removeEventListener("compositionstart", onCompStart, true);
      ta.removeEventListener("compositionupdate", onCompUpdate, true);
      ta.removeEventListener("compositionend", onCompEnd, true);
      ta.removeEventListener("input", onInput, true);
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
