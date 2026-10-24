#!/usr/bin/env bash
# macOS 앱에 넣을 유니버설(arm64+x86_64) tmux·jq 를 만들어 src-tauri/resources/bin/ 에 둔다.
#   build-tmux.sh
# tmux 는 libevent 를 정적으로 묶어 소스에서 빌드하고(macOS 기본 ncurses 사용), jq 는 공식 macOS 바이너리를 받는다.
# 결과물은 커밋한다 — CI 는 이 스크립트를 돌리지 않는다(ADR 261024-202909).
set -euo pipefail

TMUX_VER=3.6a
LIBEVENT_VER=2.1.12-stable
JQ_VER=1.8.1
ARCHS=(arm64 x86_64)
export MACOSX_DEPLOYMENT_TARGET=11.0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src-tauri/resources/bin"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
JOBS="$(sysctl -n hw.ncpu)"

curl -fsSL -o "$WORK/libevent.tar.gz" "https://github.com/libevent/libevent/releases/download/release-$LIBEVENT_VER/libevent-$LIBEVENT_VER.tar.gz"
curl -fsSL -o "$WORK/tmux.tar.gz" "https://github.com/tmux/tmux/releases/download/$TMUX_VER/tmux-$TMUX_VER.tar.gz"

for arch in "${ARCHS[@]}"; do
  host="$([ "$arch" = arm64 ] && echo aarch64 || echo x86_64)-apple-darwin"
  pre="$WORK/prefix-$arch"
  export CC="cc -arch $arch"

  mkdir -p "$WORK/$arch" && tar -xzf "$WORK/libevent.tar.gz" -C "$WORK/$arch"
  (cd "$WORK/$arch/libevent-$LIBEVENT_VER" &&
    ./configure -q --host="$host" --prefix="$pre" --disable-shared --enable-static --disable-openssl --disable-samples --disable-libevent-regress &&
    make -s -j"$JOBS" && make -s install) >/dev/null

  tar -xzf "$WORK/tmux.tar.gz" -C "$WORK/$arch"
  (cd "$WORK/$arch/tmux-$TMUX_VER" &&
    LIBEVENT_CFLAGS="-I$pre/include" LIBEVENT_LIBS="$pre/lib/libevent_core.a" \
    LIBNCURSES_CFLAGS="" LIBNCURSES_LIBS="-lncurses" \
      ./configure -q --host="$host" --disable-utf8proc &&
    make -s -j"$JOBS") >/dev/null 2>&1
  cp "$WORK/$arch/tmux-$TMUX_VER/tmux" "$WORK/tmux-$arch"
done
unset CC

mkdir -p "$OUT"
lipo -create "$WORK/tmux-arm64" "$WORK/tmux-x86_64" -output "$OUT/tmux"

curl -fsSL -o "$WORK/jq-arm64" "https://github.com/jqlang/jq/releases/download/jq-$JQ_VER/jq-macos-arm64"
curl -fsSL -o "$WORK/jq-x86_64" "https://github.com/jqlang/jq/releases/download/jq-$JQ_VER/jq-macos-amd64"
lipo -create "$WORK/jq-arm64" "$WORK/jq-x86_64" -output "$OUT/jq"

chmod 755 "$OUT/tmux" "$OUT/jq"
"$OUT/tmux" -V
"$OUT/jq" --version
for b in tmux jq; do echo "$b: $(lipo -archs "$OUT/$b")"; done
