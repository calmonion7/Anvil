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
    const input = term.onData((d) => invoke("term_write", { id, data: d }));

    const ro = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      fit.fit();
      invoke("term_resize", { id, cols: term.cols, rows: term.rows });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      input.dispose();
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
