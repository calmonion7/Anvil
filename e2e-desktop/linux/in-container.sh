#!/bin/bash
# 컨테이너(root)에서: 데스크톱 Ubuntu에 원래 있는 것(WebKitGTK·인증서·wget·한글 글꼴) + 테스트 도구(WebDriver·가상 화면)만 깔고,
# 일반 사용자 tester로 시나리오를 돌린다. curl·git·node·tmux는 일부러 넣지 않는다(데스크톱 기본 설치에 없다).
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq libwebkit2gtk-4.1-0 libgtk-3-0 librsvg2-common ca-certificates wget fonts-noto-cjk sudo \
  webkit2gtk-driver xvfb dbus >/dev/null
[ -z "$PREINSTALL" ] || apt-get install -y -qq $PREINSTALL >/dev/null

# 결과 폴더를 러너 사용자도 지울 수 있게 같은 uid로. 데스크톱 사용자처럼 sudo 가능(시나리오가 안내대로 git을 직접 깐다)
useradd -m -s /bin/bash -u "$(stat -c %u /work)" tester
echo 'tester ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/tester
out="/work/e2e-desktop/out/linux-$SCENARIO"
mkdir -p "$out" && chown tester "$out"
{ echo "== 컨테이너 =="; cat /etc/os-release | head -2; for p in node tmux jq claude curl git; do printf '%s: ' "$p"; command -v "$p" || echo 없음; done; } > "$out/env.log"

# env -i: 하네스 node(/opt)가 앱의 PATH로 새지 않게 깨끗한 데스크톱 환경만 준다
exec runuser -u tester -- env -i HOME=/home/tester USER=tester LOGNAME=tester SHELL=/bin/bash LANG=C.UTF-8 \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  ANVIL_BIN=/work/src-tauri/target/debug/anvil TAURI_DRIVER=/opt/tauri-driver E2E_OUT="$out" SPECS="$SPECS" \
  bash /work/e2e-desktop/linux/as-tester.sh
