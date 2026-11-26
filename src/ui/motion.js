/* 화면 움직임 (디자인 미리보기 브랜치)
   - 시트: 아래에서 올라오고, 닫을 때는 복제본만 살짝 내려가며 사라진다(실제 상태는 기존처럼 바로 정리)
   - '동작 줄이기'를 켠 기기에서는 아무것도 하지 않는다 */
(function () {
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $s = sel => document.querySelector(sel);
  const once = (el, cls, ms) => {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el["_t_" + cls]); el["_t_" + cls] = setTimeout(() => el.classList.remove(cls), ms);
  };

  /* ---------- 시트 열기 ---------- */
  if (typeof window.sheet === "function") {
    const openSheet = window.sheet;
    window.sheet = function (html, options = {}) {
      const scrim = $s("#scrim");
      const wasOpen = scrim && !scrim.hidden;
      const same = Boolean(options.placeId && wasOpen && scrim.dataset.placeId === options.placeId);
      const result = openSheet.apply(this, arguments);
      if (reduce() || !scrim) return result;
      const panel = scrim.querySelector(".sheet");
      if (!wasOpen) { once(scrim, "mo-scrim-in", 340); once(panel, "mo-sheet-in", 340); }
      else if (!same) once(panel, "mo-sheet-swap", 260);
      return result;
    };
  }

  /* ---------- 시트 닫기 ---------- */
  if (typeof window.closeSheet === "function") {
    const close = window.closeSheet;
    window.closeSheet = function () {
      const scrim = $s("#scrim"), panel = scrim && scrim.querySelector(".sheet");
      if (!reduce() && scrim && !scrim.hidden && panel) {
        const ghost = document.createElement("div");
        ghost.className = "mo-ghost" + (scrim.classList.contains("detail-scrim") ? " detail" : "");
        ghost.setAttribute("aria-hidden", "true");
        const copy = panel.cloneNode(true);
        copy.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
        copy.removeAttribute("tabindex"); copy.removeAttribute("role");
        copy.style.height = panel.offsetHeight + "px"; copy.style.maxHeight = "none";
        ghost.appendChild(copy);
        scrim.parentNode.insertBefore(ghost, scrim);
        copy.scrollTop = panel.scrollTop;
        setTimeout(() => ghost.remove(), 200);
      }
      return close.apply(this, arguments);
    };
  }

  /* 탭 이동은 애니메이션 없이 즉시 전환한다 (사용자 결정, 2026-11-27) */
})();
