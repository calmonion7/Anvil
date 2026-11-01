// 창에 내보내는 것은 폴더 고르기와 알림을 눌러 고른 프로젝트 받기 둘이다.
// 폴더 고르기: 주 프로세스가 OS 기본 폴더 창을 Anvil 창에 붙여 연다.
// 화면은 브라우저의 prompt()를 쓸 수 없고(Electron엔 없다), 서버가 띄우는 창은 Anvil 뒤로 숨는다(Windows VM UAT 2026-10-31).
// sandbox 창의 preload라 CommonJS다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anvilDesktop', {
  /** 고른 폴더의 절대 경로, 취소하면 null */
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  /** 입력 대기 알림을 눌러 고를 프로젝트 경로(한 번 가져가면 비워진다), 없으면 null */
  takeProject: () => ipcRenderer.invoke('take-project'),
  /** 창이 열려 있는 동안 알림을 누르면 부른다 — 그때 `takeProject`로 가져간다 */
  onProjectPicked: (cb) => ipcRenderer.on('select-project', () => cb()),
});
