#!/bin/bash
# fg-loop 정지 조건 C1~C6. 인자로 C번호를 주면 그것만 검사한다.
cd "$(dirname "$0")/../../.."
CARGO=$(ls ~/.rustup/toolchains/*/bin/cargo | head -1)
export PATH="$(dirname "$CARGO"):$PATH"
want="${1:-C1 C2 C3 C4 C5 C6}"; rc=0
ok(){ echo "$1: pass"; }; no(){ echo "$1: FAIL — $2"; rc=1; }
for c in $want; do case $c in
C1) python3 - <<'PY' && ok C1 || no C1 "release.yml 구조"
import yaml
w=yaml.safe_load(open('.github/workflows/release.yml'))
on=w.get(True) or w.get('on'); tags=on['push']['tags']; assert any(t.startswith('v') for t in tags),tags
s=yaml.dump(w)
for k in ['aarch64-apple-darwin','x86_64-apple-darwin','windows-latest','ubuntu-22.04','webkit2gtk-4.1','tauri-apps/tauri-action','TAURI_SIGNING_PRIVATE_KEY','npm ci']: assert k in s,k
steps=[st for j in w['jobs'].values() for st in j['steps'] if 'tauri-action' in str(st.get('uses',''))]
wi=steps[0]['with']; assert wi.get('releaseDraft') is True; assert wi.get('includeUpdaterJson',True) is not False
PY
;;
C2) python3 - <<'PY' && ok C2 || no C2 "tauri.conf/Cargo 업데이터·번들"
import json,os,re
c=json.load(open('src-tauri/tauri.conf.json')); b=c['bundle']
assert b['targets']=='all'; assert b.get('createUpdaterArtifacts') in (True,'v1Compatible')
ic=b['icon']; assert any(i.endswith('.ico') for i in ic) and any(i.endswith('.icns') for i in ic)
for i in ic: assert os.path.exists('src-tauri/'+i),i
u=c['plugins']['updater']; assert any(e.endswith('releases/latest/download/latest.json') for e in u['endpoints'])
assert len(u['pubkey'])>40 and 'PLACEHOLDER' not in u['pubkey']
assert re.search(r'^tauri-plugin-updater\s*=',open('src-tauri/Cargo.toml').read(),re.M)
PY
;;
C3) (cd src-tauri && cargo test --lib updater_skip 2>&1 | grep -E 'test result: ok\. [1-9]') >/dev/null && ok C3 || no C3 "updater_skip 테스트"
;;
C4) (cd src-tauri && cargo test --lib wsl_path 2>&1 | grep -E 'test result: ok\. ([4-9]|[1-9][0-9])') >/dev/null && ok C4 || no C4 "wsl_path 테스트(4개 이상)"
;;
C5) n=$(grep -rnE 'Command(Builder)?::new\("tmux"\)' src-tauri/src | wc -l | tr -d ' ')
    if grep -rq 'wsl.exe' src-tauri/src && grep -rq 'cfg(windows)' src-tauri/src && [ "$n" -le 1 ] \
       && (cd src-tauri && cargo test --lib backend_missing 2>&1 | grep -E 'test result: ok\. [1-9]') >/dev/null
    then ok C5; else no C5 "tmux 직접호출 ${n}곳 / wsl 분기·backend_missing 테스트"; fi
;;
C6) if (cd src-tauri && cargo test >/dev/null 2>&1) && npm run check >/dev/null 2>&1 && npm run build >/dev/null 2>&1
    then ok C6; else no C6 "cargo test / npm run check / npm run build"; fi
;;
esac; done; exit $rc
