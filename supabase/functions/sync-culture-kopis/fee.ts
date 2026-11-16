// 요금 문구 → 일반 가격 + 대상별 혜택 규칙
// 규칙 형식은 앱의 ruleOk()와 같다: { t: "ageMax"|"ageMin"|"student"|"soldier"|"disabled"|"merit"|"gu", v?, p: 가격, l: 표시 문구 }
export type Rule = { t: string; v?: string | number; p: number; l: string };

const TARGETS: { re: RegExp; word: string; make: (p: number, l: string) => Rule[] }[] = [
  { re: /대학생|대학원생/, word: "대학생", make: (p, l) => [{ t: "student", v: "univ", p, l }] },
  { re: /청소년|중고생|중·고생|중고등/, word: "청소년", make: (p, l) => [{ t: "ageMax", v: 18, p, l }] },
  { re: /학생/, word: "학생", make: (p, l) => [{ t: "student", v: "univ", p, l }, { t: "student", v: "school", p, l }] },
  { re: /어린이|유아|초등|아동|소인/, word: "어린이", make: (p, l) => [{ t: "ageMax", v: 12, p, l }] },
  { re: /경로|어르신|노인|65세/, word: "경로", make: (p, l) => [{ t: "ageMin", v: 65, p, l }] },
  { re: /장애/, word: "장애인", make: (p, l) => [{ t: "disabled", p, l }] },
  { re: /국가유공|유공자/, word: "국가유공자", make: (p, l) => [{ t: "merit", p, l }] },
  { re: /군인|장병/, word: "군인", make: (p, l) => [{ t: "soldier", p, l }] },
];

function amounts(seg: string): number[] {
  const out: number[] = [];
  for (const m of seg.matchAll(/(\d+(?:\.\d+)?)\s*만\s*원/g)) out.push(Math.round(Number(m[1]) * 10000));
  const rest = seg.replace(/(\d+(?:\.\d+)?)\s*만\s*원/g, " ");
  for (const m of rest.matchAll(/(\d{1,3}(?:,\d{3})+|\d{3,7})(\s*원)?/g)) {
    const raw = m[1];
    const end = (m.index ?? 0) + m[0].length;
    const after = rest.slice(end, end + 2).trim();
    if (/^(년|월|일|시|분|세|명|회|차|주|학|%|층|열|석|번|호|매)/.test(after)) continue;
    const v = Number(raw.split(",").join(""));
    const hasWon = Boolean(m[2]) || raw.includes(",");
    if (!hasWon && v >= 1900 && v <= 2100) continue; // 연도
    if (v < 100) continue;
    out.push(v);
  }
  return out;
}

export function parseFee(fee: string | null | undefined, isFree?: string | null): { price: number | null; rules: Rule[] } {
  const text = String(fee ?? "").replace(/\s+/g, " ").trim();
  const segs = text.split(/\s*(?:\/|\||·|\n|,(?!\d{3}))\s*/).map(s => s.trim()).filter(Boolean);
  const general: number[] = [];
  const fixed: Rule[] = [];
  const pct: { target: typeof TARGETS[number]; pct: number }[] = [];
  for (const seg of segs) {
    if (/별도/.test(seg)) continue;
    let target = TARGETS.find(x => x.re.test(seg));
    // "만 24세 이하", "65세 이상" 같은 나이 조건
    const ageUnder = seg.match(/(\d{1,2})\s*세\s*(이하|미만)/), ageOver = seg.match(/(\d{1,2})\s*세\s*이상/);
    if (!target && ageUnder) { const n = Number(ageUnder[1]) - (ageUnder[2] === "미만" ? 1 : 0); target = { re: /./, word: `만 ${n}세 이하`, make: (p, l) => [{ t: "ageMax", v: n, p, l }] }; }
    if (!target && ageOver) { const n = Number(ageOver[1]); target = { re: /./, word: `만 ${n}세 이상`, make: (p, l) => [{ t: "ageMin", v: n, p, l }] }; }
    // "마포구민 50% 할인", "서대문구 주민 무료" 같은 구민 할인
    const guMatch = seg.match(/([가-힣]{1,4}구)\s*(?:민|주민|거주)/);
    if (!target && guMatch) { const g = guMatch[1]; target = { re: /./, word: `${g}민`, make: (p, l) => [{ t: "gu", v: g, p, l }] }; }
    const nums = amounts(seg);
    const pm = seg.match(/(\d{1,2})\s*%/);
    if (target && pm) { pct.push({ target, pct: Number(pm[1]) }); general.push(...nums); continue; }
    if (target && nums.length) { fixed.push(...target.make(Math.min(...nums), `${target.word} 요금`)); continue; }
    if (target && /무료/.test(seg)) { fixed.push(...target.make(0, `${target.word} 무료`)); continue; }
    if (!target) general.push(...nums);
  }
  let price: number | null = general.length ? Math.min(...general) : fixed.some(r => r.p > 0) ? Math.max(...fixed.map(r => r.p)) : null;
  if (price === null && (/무료/.test(text) || isFree === "무료")) price = 0;
  if (price === null) return { price: null, rules: [] };
  const rules: Rule[] = [...fixed];
  for (const { target, pct: n } of pct) {
    if (n <= 0 || n >= 100) continue;
    const p = Math.round(price * (1 - n / 100) / 100) * 100;
    rules.push(...target.make(p, `${target.word} ${n}% 할인`));
  }
  // 일반 가격보다 싸지 않은 규칙은 버리고, 같은 조건은 가장 싼 것만 남긴다
  const best = new Map<string, Rule>();
  for (const r of rules) {
    if (r.p >= price) continue;
    const key = `${r.t}:${r.v ?? ""}`;
    if (!best.has(key) || best.get(key)!.p > r.p) best.set(key, r);
  }
  return { price, rules: [...best.values()] };
}
