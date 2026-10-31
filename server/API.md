# Anvil 서버 API 계약

`node server/main.js` — `127.0.0.1`에만 연다. 포트는 고정 `4517`, 환경변수 `ANVIL_PORT`로만 바꾼다. 시작하면 토큰이 붙은 첫 주소(`http://127.0.0.1:<port>/?token=<t>`)를 stdout에 찍는다.

같은 데이터 폴더에 살아 있는 서버가 있으면(`instance.js` `running()`) 새로 뜨지 않고 `Anvil: 이미 실행 중 <첫 주소>`를 찍고 0으로 끝난다. 살아 있는 세션도 붙은 웹소켓도 없는 상태가 `ANVIL_IDLE_MS`(기본 5분, `0`이면 끔) 이어지면 `server.json`을 지우고 0으로 끝난다. 데스크톱 앱(`electron/main.js`)은 Electron을 `ELECTRON_RUN_AS_NODE=1`로 이 파일에 부른다.

테스트 전용 환경변수: `ANVIL_CLAUDE`(claude 자리에 띄울 실행 파일 — 가짜 claude), `ANVIL_SKIP_DEPS`(준비물이 다 있는 것으로 답한다 — 준비물이 없는 CI 러너의 앱 스모크용).

## 보안

| 검사 | 대상 | 거절 |
|---|---|---|
| `Host`가 `127.0.0.1:<port>`·`localhost:<port>` | 모든 요청·웹소켓 | 403 (DNS 리바인딩) |
| `Origin`이 있으면 `http://127.0.0.1:<port>`·`http://localhost:<port>` | 모든 요청·웹소켓 | 403 |
| 토큰: 쿠키 `anvil_<port>=<t>` 또는 `Authorization: Bearer <t>` | `/api/*`·`/ws` (정적 파일은 토큰 없음) | 401 |

- 토큰은 실행마다 새로 만들어 `<data>/token`(600)에 쓴다.
- `GET /?token=<t>`: 맞으면 `HttpOnly; SameSite=Strict; Path=/` 쿠키를 주고 `/`로 302, 틀리면 401.
- `GET /instance?nonce=<32자 hex>`: 토큰 없이 `{ proof: HMAC-SHA256(token, nonce) hex }`. 앱이 토큰을 보내기 전에 그 포트의 서버가 토큰의 주인인지 확인한다(낡은 `server.json`의 포트를 다른 사용자의 프로세스가 잡고 있을 때 가짜 화면에 붙지 않게).

## 명령: `POST /api/<명령>`

본문은 지금 화면이 `invoke(명령, 인자)`에 넘기는 인자 그대로의 JSON(인자 없으면 `{}` 또는 빈 본문), 응답은 Tauri 명령이 돌려주던 값 그대로의 JSON(값 없음은 `null`).
오류: 없는 명령 404, POST 아님 405, JSON 아님 400, 명령이 던짐 500 — 모두 `{ "error": "<메시지>" }`(Tauri의 `Err(String)` 자리).

| 명령 | 인자 | 결과 | 모듈 |
|---|---|---|---|
| `list_projects` | – | `Snapshot[]` | forge.js |
| `add_project` | `{path}` | `Snapshot[]` | forge.js |
| `remove_project` | `{path}` | `Snapshot[]` | forge.js |
| `read_doc` | `{project, rel}` | `string` | forge.js |
| `session_states` | – | `{[name]: SessionState}` | session.js |
| `session_names` | `{project}` | `[plan, run]` | session.js |
| `session_titles` | `{project}` | `[[title, model], [title, model]]` | session.js |
| `model_settings` | – | `{plan, run}` | session.js |
| `set_model_setting` | `{role, model}` | `null` | session.js |
| `session_models` | – | `{[name]: ModelInfo}` | session.js |
| `session_start` | `{project, role}` | `string` | session.js |
| `session_kill` | `{name}` | `null` | session.js |
| `session_fill` | `{project, role, text}` | `string`(채운 세션 이름) | session.js |
| `slash_commands` | `{project}` | `string[]` | session.js |
| `deps_status` | – | `{needs, message, installable:false, platform}` | deps.js |
| `deps_install` | – | 지금 진행 `{running, items:[{need, label, state, detail}]}`(설치는 뒤에서 계속 — `deps_progress` 이벤트). 이미 도는 중이면 새로 시작하지 않는다 | deps.js |
| `forge_plugin_status` | – | `{installed, latest, update_available, untested}` | deps.js |
| `forge_plugin_update` | – | `null` | deps.js |
| `set_lang` | `{en}` | `null` | i18n.js |
| `pick_folder` (새) | – | 절대 경로 `string` · 취소 `null` · macOS 아님 `{unsupported:true}`(화면이 경로 입력으로) | pick.js |

없앤 명령: `deps_login`·`updater_check`·`updater_install`·`notify`. `deps_install`은 3/6에서 버튼 없는 첫 실행 자동 설치로 다시 생겼다.

## 웹소켓: `GET /ws`

연결 하나가 이벤트와 그 화면의 터미널을 모두 나른다. 메시지는 JSON 한 개씩.

| 방향 | 메시지 | 뜻 |
|---|---|---|
| 서버→화면 | `{type:'event', name, payload}` | Tauri `emit`. `name`: `snapshot`(Snapshot 하나) · `sessions` · `models` · `deps_progress`(자동 설치 진행 — `state`: `pending`·`running`·`ok`·`failed`·`skipped`) |
| 화면→서버 | `{type:'term_open', id, name, cols, rows}` | 세션 `name`에 터미널 `id`를 붙인다 |
| 화면→서버 | `{type:'term_write', id, data}` | 입력 |
| 화면→서버 | `{type:'term_resize', id, cols, rows}` | 크기 |
| 화면→서버 | `{type:'term_close', id}` | 떼기(세션은 남는다) |
| 서버→화면 | `{type:'term', id, data}` | 출력(Tauri `Channel` 자리) |
| 서버→화면 | `{type:'term_error', id, error}` | 터미널 명령 실패(`invoke`의 reject 자리) |

- 터미널 `id`는 **연결마다** 화면이 정한다 — 서버는 (연결, id)로 구분한다. 연결이 끊기면 그 연결의 터미널은 떼어지고 pty는 남는다.
- `term_*`는 웹소켓으로만 받는다(`POST /api/term_*`는 400).

## 모듈 규약

- 모듈은 `export const commands = { <명령>: async (args, ctx) => 결과 }`를 내보낸다. 코어(`http.js`)가 모든 모듈의 `commands`를 모아 등록한다(이름이 겹치면 시작 실패). 새 모듈은 `http.js`의 `MODULES`에 한 줄 넣는다.
- 시작할 때 할 일(감시 시작·훅 설치 등)은 선택적으로 `export async function init(ctx)` — 코어가 listen 전에 부른다.
- 포트를 잡은 뒤에 할 일(세션 복구 등)은 선택적으로 `export async function ready(ctx)` — 코어가 listen·토큰·`server.json`을 쓴 뒤 부른다. 포트를 못 잡은 두 번째 서버는 여기까지 오지 않는다.
- 던진 `Error`의 `message`가 화면에 가는 오류 문구다(`tr()`로 한국어/영어).
- `ctx`:
  - `dataDir` — 데이터 폴더 절대 경로
  - `port`
  - `broadcast(name, payload)` — 열린 모든 화면에 이벤트
  - `registered(project)` — 등록한 프로젝트인가(forge.js의 `registered`)
  - `conn` — `term_*`에서만: `{ send(msg), onClose(fn) }`. 출력은 `conn.send({type:'term', id, data})`.
- 함께 쓰는 것: `env.js`(`runPath()`·`loginPath()`·`claudeHome()`), `i18n.js`(`tr(ko, en)`), `pty.js`(node-pty — 반드시 이걸로 불러온다).

## 데이터 폴더 (`ANVIL_DATA_DIR`, 기본 `~/.anvil`, 700)

| 파일 | 주인 |
|---|---|
| `token` (600) | 코어 |
| `server.json` (600) — 실행 중 서버 `{port, pid}`, 포트를 잡은 뒤 쓴다 | 코어(instance.js) |
| `server.log` (600) — 앱이 띄운 서버의 출력 | electron/main.js |
| `bin/node` — Electron 아래서 돌 때 세션 PATH 맨 앞에 두는 node 대체 실행 파일 | env.js |
| `projects.json` — 등록한 프로젝트 경로 배열 | forge.js |
| `settings.json` · `sessions/` · `models/` · 훅·상태줄 스크립트 | session.js |
| `restore.json` (600) — 열린 세션 `[{name, project, role, sessionId}]`, 다음 서버가 `claude --resume`으로 다시 띄운다. [세션 종료]·claude 스스로 종료(종료 코드 0~127) 때만 빠진다 — 신호로 죽거나 128 이상이면 남는다 | session.js |

Tauri 앱의 데이터 폴더는 쓰지 않는다(새로 시작).

## 테스트

`node --test server/` — `server/index.js`가 `server/` 아래 `*.test.js`를 모두 불러온다(Node 22+는 디렉터리 인자를 모듈로 실행한다). 새 테스트는 `*.test.js`로 두기만 하면 된다.
