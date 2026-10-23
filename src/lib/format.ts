import { t } from "./i18n.svelte";

/** `YYYY-MM-DD` → 오늘 / 어제 / M월 D일 */
export function dayLabel(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return t("오늘", "Today");
  if (diff === 1) return t("어제", "Yesterday");
  return t(`${+m[2]}월 ${+m[3]}일`, d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
}

/** 계획 제목 `앞 — 뒤`를 제목과 부제로 나눈다. */
export function splitTitle(title: string): [string, string] {
  const i = title.indexOf(" — ");
  return i < 0 ? [title, ""] : [title.slice(0, i), title.slice(i + 3)];
}

export const priorityLabel = {
  get high() { return t("높음", "High"); },
  get medium() { return t("보통", "Medium"); },
  get low() { return t("낮음", "Low"); },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 한 줄 글의 `코드`만 <code>로 바꾼다(나머지는 이스케이프). */
export function inlineCode(text: string): string {
  return esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** STATUS 값의 첫 낱말을 정규화한다(forge-status의 norm과 같다). */
export const norm = (v: string | null) => (v ?? "").toLowerCase().match(/^[a-z/]*/)![0];
