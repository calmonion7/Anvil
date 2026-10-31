<script lang="ts">
  import { openTerm } from "./api";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { t } from "./i18n.svelte";
  import "@xterm/xterm/css/xterm.css";
  import { onMount } from "svelte";

  /** 살아 있는 세션 이름 — 이 컴포넌트는 서버가 쥔 그 세션의 pty에 웹소켓으로 붙기만 한다. */
  /** focusTick이 바뀔 때마다 이 터미널에 초점을 준다(보드 버튼이 명령을 채운 뒤 · [세션 열기] 뒤). */
  let { name, focusTick = 0 }: { name: string; focusTick?: number } = $props();

  let host: HTMLDivElement;
  let termRef: Terminal | null = null;

  $effect(() => {
    if (focusTick) termRef?.focus();
  });

  onMount(() => {
    const term = new Terminal({
      fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 10000, // 스크롤백은 xterm이 맡는다(다시 붙으면 서버가 최근 출력을 재생)
      theme: { background: "#111110", foreground: "#e6e5e0", cursor: "#e6e5e0", selectionBackground: "#3987e566" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef = term;
    if (focusTick) term.focus();
    fit.fit();

    const pty = openTerm(name, term.cols, term.rows, {
      data: (s) => term.write(s),
      error: (e) => term.write(t(`\r\n[세션에 붙지 못했습니다: ${e}]\r\n`, `\r\n[Could not attach to session: ${e}]\r\n`)),
      reset: () => term.reset(),
    });
    const send = pty.write;

    // 한글 IME: WKWebView는 한글에 composition 이벤트를 보내지 않고, 입력 칸의 글자를 바꿔치기한다.
    //   ㅎ(insertText) → 호 → 화 → 확(insertReplacementText) → 다음 음절 ㅇ(insertText) …
    // xterm.js는 첫 insertText만 보내고 바꿔치기를 무시해 「ㅎ ㅇ」처럼 떨어져 들어간다.
    // 그래서 이 두 input 이벤트를 직접 해석한다: 새 음절은 그대로 보내고, 바꿔치기는 직전에 보낸
    // 글자 수만큼 DEL로 지운 뒤 새 글자를 보낸다. xterm이 따로 보내는 한글은 붙여넣기 중이 아닐
    // 때만 버린다. WebKit은 IME 키의 keydown(229)을 input 뒤에 보내므로 키 순서에 기대지 않는다.
    const HANGUL_ONLY = /^[ᄀ-ᇿ㄰-㆏가-힯]+$/;
    /** 지금 조합 중이라 바꿔치기될 수 있는, 이미 터미널에 보낸 글자 */
    let composing = "";
    /** 붙여넣기 처리 중(xterm이 붙여넣은 한글을 보내는 동안) */
    let pasting = false;
    /** 이 브라우저가 한글도 composition 이벤트로 조합한다(Chromium·Firefox) — 그러면 위 해석은 끄고 xterm에 맡긴다 */
    let standardIme = false;
    const onCompose = () => (standardIme = true);
    const erase = (s: string) => "\x7f".repeat([...s].length);
    const onInput = (e: Event) => {
      if (standardIme) return;
      const { inputType, data } = e as InputEvent;
      if (inputType === "insertText" && data && HANGUL_ONLY.test(data)) {
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
      if (e.keyCode !== 229) composing = "";
    };
    const onPaste = () => {
      pasting = true;
      setTimeout(() => (pasting = false), 0);
    };
    host.addEventListener("input", onInput, true);
    host.addEventListener("keydown", onKey, true);
    host.addEventListener("paste", onPaste, true);
    host.addEventListener("compositionstart", onCompose, true);
    const input = term.onData((d) => {
      if (!pasting && !standardIme && HANGUL_ONLY.test(d)) return;
      send(d);
    });

    const ro = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      fit.fit();
      pty.resize(term.cols, term.rows);
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      input.dispose();
      host.removeEventListener("input", onInput, true);
      host.removeEventListener("keydown", onKey, true);
      host.removeEventListener("paste", onPaste, true);
      host.removeEventListener("compositionstart", onCompose, true);
      pty.close();
      term.dispose();
    };
  });
</script>

<div class="host" bind:this={host}></div>

<style>
  .host { flex: 1; min-height: 0; padding: 4px 8px; background: #111110; }
  .host :global(.xterm) { height: 100%; }
</style>
