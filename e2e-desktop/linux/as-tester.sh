#!/bin/bash
# tester로: 가상 화면을 띄우고 시험 프로젝트를 등록한 뒤 spec마다 앱을 새로 띄워 돌린다.
set -u
Xvfb :99 -screen 0 1440x900x24 >/dev/null 2>&1 &
export DISPLAY=:99
sleep 1
mkdir -p ~/anvil-e2e-project ~/.local/share/com.taebro.anvil
printf '["%s"]\n' "$HOME/anvil-e2e-project" > ~/.local/share/com.taebro.anvil/projects.json

cd /work/e2e-desktop
fail=0
for s in $SPECS; do
  dbus-run-session -- /opt/harness-node/bin/node node_modules/@wdio/cli/bin/wdio.js run wdio.conf.mjs --spec "$s" || fail=1
done
exit $fail
