// 서버가 화면에 내보내는 문구의 언어. 화면이 `set_lang`으로 알려 준다(기본 한국어) — src-tauri/src/i18n.rs 이식.

let en = false;

/** 쓰는 자리에서 두 언어를 나란히: `tr("세션 종료", "End session")` */
export const tr = (ko, enText) => (en ? enText : ko);

export const commands = {
  set_lang: async (args) => {
    en = Boolean(args.en);
    return null;
  },
};
