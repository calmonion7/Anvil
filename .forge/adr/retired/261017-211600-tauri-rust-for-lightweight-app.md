---
author: taebro
decided: 2026-10-17 21:16
---
Status: Superseded by ADR-261030-005852 (Electron 데스크톱 앱 — 6/6에서 은퇴)
# 앱은 Tauri 2(Rust 백엔드 + 시스템 WebView)로 만든다

사용자는 VS Code 같은 레이아웃(왼쪽 목록 · 가운데 보드 · 아래 터미널)을 원했고, 기술을 고르는 기준은 "메모리를 많이 쓰지 않는 가벼운 앱"이었다. Electron과 VS Code 확장은 구현량이 가장 적지만 Chromium을 함께 실어 기본 메모리가 수백 MB이고, 로컬 웹앱은 독립 프로그램이 아니다. 그래서 macOS 내장 WebView를 쓰는 Tauri를 골랐다. 그 대가로 pty·파일 감시·`.forge` 파싱 같은 백엔드를 Rust로 짜고 유지해야 한다. 화면(HTML/CSS + xterm.js)은 어느 쪽이든 같다.

## Considered Options
- Electron — VS Code와 같은 조합(node-pty + xterm.js). 메모리 때문에 기각.
- VS Code 확장 — 터미널·트리·탭을 거저 얻지만 독립 앱이 아니고, VS Code 자체가 무겁다.
- 로컬 웹앱(Node 서버 + 브라우저) — 셸을 띄우는 서버를 localhost에 상주시켜야 하고, 브라우저 탭이라 앱 느낌이 아니다.
