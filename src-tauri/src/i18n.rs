//! 백엔드가 화면에 내보내는 문구의 언어. 화면이 `set_lang`으로 알려 준다(기본 한국어).

use std::sync::atomic::{AtomicBool, Ordering};

static EN: AtomicBool = AtomicBool::new(false);

pub fn set_en(en: bool) {
    EN.store(en, Ordering::Relaxed);
}

/// 쓰는 자리에서 두 언어를 나란히: `tr("세션 종료", "End session")`
pub fn tr<'a>(ko: &'a str, en: &'a str) -> &'a str {
    if EN.load(Ordering::Relaxed) { en } else { ko }
}
