#!/usr/bin/env bash
# Linux·WSL용 정적(musl) tmux 를 x86_64·aarch64 로 만들어 src-tauri/resources/bin-linux/ 에 둔다(ADR 261025-163349).
#   build-tmux-linux.sh      (docker 필요 — 이 맥의 docker 로 alpine 컨테이너에서 빌드)
# 배포판마다 terminfo 위치가 달라(22.04 /lib/terminfo, 26.04 /usr/share/terminfo) ncurses 를 직접 빌드해
# 자주 쓰는 항목을 바이너리에 내장하고 세 경로를 모두 찾게 한다. 결과물은 커밋한다 — CI 는 이 스크립트를 돌리지 않는다.
set -euo pipefail

TMUX_VER=3.6a
NCURSES_VER=6.5
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src-tauri/resources/bin-linux"
mkdir -p "$OUT"

for plat in amd64 arm64; do
  docker run --rm --platform "linux/$plat" -v "$OUT:/out" -e TMUX_VER="$TMUX_VER" -e NCURSES_VER="$NCURSES_VER" alpine:3.22 sh -euc '
    apk add --no-cache build-base curl bison pkgconf file libevent-dev libevent-static ncurses ncurses-terminfo >/dev/null
    cd /tmp
    curl -fsSL "https://ftp.gnu.org/gnu/ncurses/ncurses-$NCURSES_VER.tar.gz" | tar -xz
    (cd "ncurses-$NCURSES_VER" &&
      ./configure -q --prefix=/tmp/pre --without-shared --without-debug --without-cxx --without-cxx-binding \
        --without-ada --without-manpages --without-progs --without-tests --enable-widec --disable-db-install \
        --with-terminfo-dirs=/etc/terminfo:/lib/terminfo:/usr/share/terminfo --with-default-terminfo-dir=/usr/share/terminfo \
        --with-fallbacks=xterm-256color,tmux-256color,screen-256color,xterm,screen,vt100 &&
      make -s -j"$(nproc)" && make -s install) >/dev/null
    curl -fsSL "https://github.com/tmux/tmux/releases/download/$TMUX_VER/tmux-$TMUX_VER.tar.gz" | tar -xz
    (cd "tmux-$TMUX_VER" &&
      ./configure -q --enable-static \
        LIBNCURSES_CFLAGS="-I/tmp/pre/include/ncursesw -I/tmp/pre/include" LIBNCURSES_LIBS="/tmp/pre/lib/libncursesw.a" \
        LIBEVENT_CFLAGS="" LIBEVENT_LIBS="-levent_core" &&
      make -s -j"$(nproc)") >/dev/null
    strip "tmux-$TMUX_VER/tmux"
    install -m 755 "tmux-$TMUX_VER/tmux" "/out/tmux-$(uname -m)"
    file "/out/tmux-$(uname -m)"
  '
done
ls -l "$OUT"
