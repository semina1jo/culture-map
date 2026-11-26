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

  let skipGhost = false;
  /* ---------- 시트 닫기 ---------- */
  if (typeof window.closeSheet === "function") {
    const close = window.closeSheet;
    window.closeSheet = function () {
      const scrim = $s("#scrim"), panel = scrim && scrim.querySelector(".sheet");
      if (!skipGhost && !reduce() && scrim && !scrim.hidden && panel) {
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


  /* ---------- 시트 위 일자 바를 잡고 내려서 닫기 ----------
     장소 상세 시트는 placeSheet.js가 이미 끌어내리기를 처리하므로 그 외 시트만.
     90px 넘게 내리거나 빠르게 튕기면 닫히고, 아니면 제자리로 돌아간다 */
  let drag = null;
  const scrimEl = () => $s("#scrim");
  document.addEventListener("pointerdown", ev => {
    const grab = ev.target.closest && ev.target.closest(".sheet .grab");
    if (!grab) return;
    const panel = grab.closest(".sheet");
    if (!panel || panel.classList.contains("place-sheet")) return;
    panel.classList.remove("mo-sheet-in", "mo-sheet-swap");
    drag = { panel, id: ev.pointerId, y: ev.clientY, t: performance.now(), dy: 0, lastY: ev.clientY, lastT: performance.now(), v: 0 };
    panel.style.transition = "none";
    try { grab.setPointerCapture(ev.pointerId); } catch (_) {}
    ev.preventDefault();
  });
  document.addEventListener("pointermove", ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const now = performance.now();
    drag.v = (ev.clientY - drag.lastY) / Math.max(1, now - drag.lastT);
    drag.lastY = ev.clientY; drag.lastT = now;
    drag.dy = Math.max(0, ev.clientY - drag.y);
    drag.panel.style.transform = drag.dy ? `translateY(${drag.dy}px)` : "";
    const sc = scrimEl(); if (sc) sc.style.opacity = String(Math.max(.35, 1 - drag.dy / (drag.panel.offsetHeight || 600)));
  });
  const endDrag = ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const { panel, dy, v } = drag; drag = null;
    const sc = scrimEl();
    if (dy > 90 || (v > 0.6 && dy > 24)) {
      const ms = reduce() ? 0 : 200;
      panel.style.transition = `transform ${ms}ms cubic-bezier(.3,0,.8,.15)`;
      panel.style.transform = "translateY(100%)";
      if (sc) { sc.style.transition = `opacity ${ms}ms ease-out`; sc.style.opacity = "0"; }
      setTimeout(() => {
        skipGhost = true;
        try { if (panel.isConnected && window.closeSheet) window.closeSheet(); } finally { skipGhost = false; }
        if (sc) { sc.style.transition = ""; sc.style.opacity = ""; }
      }, ms);
    } else {
      panel.style.transition = "transform 220ms cubic-bezier(.32,.72,0,1)";
      panel.style.transform = "";
      if (sc) { sc.style.transition = "opacity 220ms ease-out"; sc.style.opacity = ""; setTimeout(() => { sc.style.transition = ""; }, 240); }
      setTimeout(() => { panel.style.transition = ""; }, 240);
    }
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  /* 탭 이동은 애니메이션 없이 즉시 전환한다 (사용자 결정, 2026-11-27) */
})();
