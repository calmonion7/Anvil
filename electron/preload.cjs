// 창에 내보내는 것은 폴더 고르기 하나뿐이다 — 주 프로세스가 OS 기본 폴더 창을 Anvil 창에 붙여 연다.
// 화면은 브라우저의 prompt()를 쓸 수 없고(Electron엔 없다), 서버가 띄우는 창은 Anvil 뒤로 숨는다(Windows VM UAT 2026-10-31).
// sandbox 창의 preload라 CommonJS다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anvilDesktop', {
  /** 고른 폴더의 절대 경로, 취소하면 null */
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
});
