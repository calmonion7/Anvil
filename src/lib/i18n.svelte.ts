import { call } from "./api";

/** 화면 언어. `auto`는 시스템 언어(한국어면 ko, 아니면 en). 선택은 이 기기 localStorage에 둔다. */
export type LangChoice = "auto" | "ko" | "en";
const KEY = "anvil.lang";

function read(): LangChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ko" || v === "en") return v;
  } catch {}
  return "auto";
}

const resolve = (c: LangChoice): "ko" | "en" =>
  c === "auto" ? (typeof navigator !== "undefined" && navigator.language.startsWith("ko") ? "ko" : "en") : c;

export const i18n = $state({ choice: read(), lang: resolve(read()) });

/** 백엔드(안내 띠 · forge 경고)도 같은 언어로. 끝난 뒤 백엔드가 만든 문구를 다시 받아야 바뀐다. */
function sync(): Promise<void> {
  document.documentElement.lang = i18n.lang;
  return call<void>("set_lang", { en: i18n.lang === "en" }).catch(() => {});
}

export function initLang(): Promise<void> {
  return sync();
}

export function setLang(c: LangChoice): Promise<void> {
  i18n.choice = c;
  i18n.lang = resolve(c);
  try {
    if (c === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  } catch {}
  return sync();
}

/** 쓰는 자리에서 두 언어를 나란히: `t("세션 종료", "End session")` */
export const t = (ko: string, en: string): string => (i18n.lang === "en" ? en : ko);
