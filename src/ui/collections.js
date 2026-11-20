/* ===== 찜 컬렉션 (2026-11-21) =====
   인스타그램 '컬렉션'·유튜브 '재생목록'처럼, 찜한 곳을 내가 만든 묶음에 나눠 담는다.
   - 찜(saved 테이블)은 그대로 '모든 찜'이고, 컬렉션은 그 안의 묶음이다. 한 곳을 여러 컬렉션에 담을 수 있다
   - 컬렉션 목록은 user_profiles.extra_fields.app_state.collections에 저장(새 테이블 없음) → 로그인하면 기기 사이에 따라온다
   - 찜을 해제하면 모든 컬렉션에서도 빠진다 */
(function () {
  const C = { view: null, rename: false, delArm: false, newOpen: false };
  const MAX_COLS = 30, MAX_NAME = 20;
  if (!Array.isArray(S.collections)) S.collections = Array.isArray(window.dataService?.read().app_state?.collections) ? window.dataService.read().app_state.collections : [];
  const cols = () => S.collections || (S.collections = []);
  const save = () => persistPreferences();
  const visible = id => { const it = findAny(id); return it && !hideDemo(it) ? it : null; };
  const savedItems = () => [...S.saved].map(visible).filter(Boolean).reverse();
  const colItems = c => c.items.filter(id => S.saved.has(id)).map(visible).filter(Boolean);
  const hasPhoto = e => Boolean(e.photo && /^https?:/.test(e.photo));
  const PAL = [["#3D5414", "#EEF6DC"], ["#B4532A", "#FFF4E8"], ["#24395C", "#E6EEFB"], ["#C99A1E", "#2A1E00"], ["#5A3A5E", "#F6EAF7"], ["#2F6B5E", "#E3F5F0"]];
  const cleanName = e => String(e.name || "").replace(/^\[[^\]]*\]\s*/, "");
  function thumb(e, cls) {
    const [bg, fg] = PAL[hashNum(e.id) % PAL.length];
    return `<span class="${cls}"><span class="cl-fb" style="background:${bg};color:${fg}">${esc(cleanName(e))}</span>${hasPhoto(e) ? `<img src="${esc(e.photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`;
  }
  // 컬렉션 표지: 담긴 곳 포스터 최대 4장을 2×2로
  function cover(items) {
    if (!items.length) return `<span class="cl-cover empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4Z"/></svg></span>`;
    const four = items.slice(0, 4);
    return `<span class="cl-cover n${four.length}">${four.map(e => thumb(e, "cl-ct")).join("")}</span>`;
  }
  const newId = () => "col_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function createCol(name, firstId) {
    name = String(name || "").trim().slice(0, MAX_NAME);
    if (!name) { toast("컬렉션 이름을 입력해 주세요."); return null; }
    if (cols().some(c => c.name === name)) { toast("같은 이름의 컬렉션이 이미 있어요."); return null; }
    if (cols().length >= MAX_COLS) { toast(`컬렉션은 ${MAX_COLS}개까지 만들 수 있어요.`); return null; }
    const c = { id: newId(), name, items: firstId ? [firstId] : [], created: new Date().toISOString() };
    cols().push(c); save(); return c;
  }
  const findCol = id => cols().find(c => c.id === id);

  /* ---------- 찜할 때: 컬렉션 고르기 ---------- */
  function pickerSheet(id, justSaved) {
    const it = findAny(id); if (!it) return;
    const rows = cols().map(c => {
      const on = c.items.includes(id), n = colItems(c).length;
      return `<button class="cl-pick" data-colpick="${c.id}" data-item="${id}" aria-pressed="${on}">${cover(colItems(c))}<span class="cl-pn"><b>${esc(c.name)}</b><small>${n}곳</small></span><span class="cl-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span></button>`;
    }).join("");
    sheet(`<div class="sh-h"><h2>${justSaved ? "찜했어요" : "컬렉션에 담기"}</h2><button class="x" id="clX" aria-label="닫기">${ico.x}</button></div>
      <div class="cl-item">${thumb(it, "cl-it")}<span><b>${esc(it.name)}</b><small>${justSaved ? "모든 찜에 저장했어요. 컬렉션에도 나눠 담을 수 있어요." : "담을 컬렉션을 고르세요. 여러 개 골라도 돼요."}</small></span></div>
      ${rows ? `<div class="cl-picks">${rows}</div>` : `<p class="note" style="margin:14px 0 4px">아직 컬렉션이 없어요. '주말에 갈 곳', '혼자 가볼 전시'처럼 묶음을 만들어 보세요.</p>`}
      <form class="cl-new" id="clNewForm" data-item="${id}"><label for="clNewName" class="sr">새 컬렉션 이름</label><input id="clNewName" maxlength="${MAX_NAME}" placeholder="새 컬렉션 이름" autocomplete="off"><button class="out" type="submit">만들고 담기</button></form>
      <div class="cl-acts"><button class="blk w" id="clDone">완료</button>${S.saved.has(id) ? `<button class="linkbtn" id="clUnsave">찜 해제</button>` : ""}</div>`);
    $("#clX").onclick = closeSheet;
    $("#clDone").onclick = () => backToDetail(id);
    $("#clNewForm").onsubmit = ev => { ev.preventDefault(); const c = createCol($("#clNewName").value, id); if (c) { toast(`'${c.name}'에 담았어요.`); pickerSheet(id, justSaved); } };
    if ($("#clUnsave")) $("#clUnsave").onclick = async ev => {
      ev.currentTarget.disabled = true;
      const r = await window.dataService.removeSaved({ target_type: "event", target_id: id });
      if (!r.ok) { ev.currentTarget.disabled = false; return; }
      S.saved.delete(id); cols().forEach(c => { c.items = c.items.filter(x => x !== id); }); save();
      toast("찜을 해제했어요."); backToDetail(id);
    };
  }
  // 상세 화면의 찜 버튼: 찜 안 한 곳이면 찜하고 바로 컬렉션 고르기, 찜한 곳이면 컬렉션 고르기(여기서 해제도 가능)
  async function onSaveButton(id, btn) {
    if (S.saved.has(id)) { pickerSheet(id, false); return; }
    if (btn) btn.disabled = true;
    const r = await window.dataService.saveTarget({ target_type: "event", target_id: id });
    if (!r.ok) { if (btn) btn.disabled = false; return; }
    S.saved.add(id); pickerSheet(id, true);
  }

  /* ---------- 찜 목록: 모든 찜 + 컬렉션 ---------- */
  function homeSheet() {
    C.view = null; C.rename = false; C.delArm = false;
    const all = savedItems();
    const cards = cols().map(c => { const items = colItems(c); return `<button class="cl-card" data-colopen="${c.id}">${cover(items)}<b>${esc(c.name)}</b><small>${items.length}곳</small></button>`; }).join("");
    sheet(`<div class="sh-h"><h2>찜 목록</h2><button class="x" id="clX" aria-label="닫기">${ico.x}</button></div>
      <div class="cl-grid">
        <button class="cl-card" data-colopen="__all">${cover(all)}<b>모든 찜</b><small>${all.length}곳</small></button>
        ${cards}
        <button class="cl-card add" data-colnew="1"><span class="cl-cover cl-plus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span><b>새 컬렉션</b><small>묶음 만들기</small></button>
      </div>
      ${C.newOpen ? `<form class="cl-new" id="clNewForm"><label for="clNewName" class="sr">새 컬렉션 이름</label><input id="clNewName" maxlength="${MAX_NAME}" placeholder="예: 주말에 갈 곳" autocomplete="off"><button class="out" type="submit">만들기</button></form>` : ""}
      ${!all.length ? '<p class="note" style="margin-top:14px">아직 찜한 곳이 없어요. 상세 화면에서 ♡ 찜을 누르면 여기에 모여요.</p>' : ""}`);
    $("#clX").onclick = closeSheet;
    if ($("#clNewForm")) { $("#clNewName").focus(); $("#clNewForm").onsubmit = ev => { ev.preventDefault(); const c = createCol($("#clNewName").value); if (c) { C.newOpen = false; colSheet(c.id); } }; }
  }
  function colSheet(colId) {
    C.view = colId;
    const isAll = colId === "__all", c = isAll ? null : findCol(colId);
    if (!isAll && !c) { homeSheet(); return; }
    const items = isAll ? savedItems() : colItems(c);
    const head = C.rename && c
      ? `<form class="cl-new" id="clRenForm" style="margin:0 0 6px"><label for="clRenName" class="sr">컬렉션 이름</label><input id="clRenName" maxlength="${MAX_NAME}" value="${esc(c.name)}" autocomplete="off"><button class="out" type="submit">저장</button></form>`
      : "";
    sheet(`<div class="sh-h"><button class="cl-back" data-colhome="1" aria-label="찜 목록으로">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>'}</button><h2>${isAll ? "모든 찜" : esc(c.name)}</h2><button class="x" id="clX" aria-label="닫기">${ico.x}</button></div>
      ${head}
      <p class="note">${items.length}곳${isAll ? " · 찜한 순서의 반대(최근 찜이 먼저)" : ""}</p>
      ${c && !C.rename ? `<div class="cl-tools"><button class="out sm" data-colren="1">이름 바꾸기</button><button class="out sm ${C.delArm ? "danger" : ""}" data-coldel="${c.id}">${C.delArm ? "한 번 더 누르면 삭제" : "컬렉션 삭제"}</button></div>` : ""}
      ${items.length ? `<div class="cl-items">${items.map(e => `<div class="cl-cell"><button class="cl-gc" data-open="${e.id}">${thumb(e, "cl-gph")}<span class="cl-tt">${esc(e.name)}</span><span class="cl-mt">${esc(e.genre4 || e.genre || "")} · ${period(e)}</span><span class="cl-pr">${priceText(e)}</span></button>${c ? `<button class="cl-rm" data-colrm="${e.id}" aria-label="${esc(e.name)} 컬렉션에서 빼기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ""}</div>`).join("")}</div>`
        : `<p class="note" style="margin-top:14px">${isAll ? "아직 찜한 곳이 없어요." : "비어 있어요. 상세 화면에서 ♥ 찜함을 누르면 이 컬렉션에 담을 수 있어요."}</p>`}`);
    $("#clX").onclick = closeSheet;
    if ($("#clRenForm")) {
      $("#clRenName").focus();
      $("#clRenForm").onsubmit = ev => { ev.preventDefault(); const v = $("#clRenName").value.trim().slice(0, MAX_NAME); if (!v) { toast("컬렉션 이름을 입력해 주세요."); return; } if (cols().some(x => x !== c && x.name === v)) { toast("같은 이름의 컬렉션이 이미 있어요."); return; } c.name = v; save(); C.rename = false; colSheet(c.id); };
    }
  }

  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-colpick],[data-colopen],[data-colnew],[data-colhome],[data-colren],[data-coldel],[data-colrm]"); if (!b) return;
    ev.stopPropagation(); ev.preventDefault();
    const d = b.dataset;
    if (d.colpick) { const c = findCol(d.colpick), id = d.item; if (!c) return; const on = c.items.includes(id); c.items = on ? c.items.filter(x => x !== id) : [...c.items, id]; save(); b.setAttribute("aria-pressed", String(!on)); b.querySelector(".cl-pn small").textContent = `${colItems(c).length}곳`; return; }
    if (d.colopen) { colSheet(d.colopen); return; }
    if (d.colnew) { C.newOpen = true; homeSheet(); return; }
    if (d.colhome) { homeSheet(); return; }
    if (d.colren) { C.rename = true; colSheet(C.view); return; }
    if (d.coldel) { if (!C.delArm) { C.delArm = true; colSheet(C.view); return; } const c = findCol(d.coldel); S.collections = cols().filter(x => x !== c); save(); toast(`'${c.name}' 컬렉션을 삭제했어요. 찜은 그대로 남아 있어요.`); homeSheet(); return; }
    if (d.colrm) { const c = findCol(C.view); if (!c) return; c.items = c.items.filter(x => x !== d.colrm); save(); colSheet(c.id); return; }
  }, true);

  const css = `
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cl-item{display:flex;align-items:center;gap:12px;margin:6px 0 4px}.cl-item b{display:block;font-size:15px;line-height:1.35}.cl-item small{display:block;color:var(--ink2);font-size:12.5px;margin-top:2px}
.cl-it{position:relative;flex:none;width:52px;height:68px;border-radius:10px;overflow:hidden;display:block}
.cl-it img,.cl-ct img,.cl-gph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cl-fb{position:absolute;inset:0;padding:6px;box-sizing:border-box;font-size:10px;font-weight:800;line-height:1.2;overflow:hidden;word-break:keep-all}
.cl-picks{display:flex;flex-direction:column;margin-top:12px;border-top:1px solid var(--line)}
.cl-pick{display:flex;align-items:center;gap:12px;border:0;border-bottom:1px solid var(--line);background:none;padding:10px 2px;text-align:left;color:var(--ink);min-height:64px}
.cl-pick .cl-cover{width:46px;height:46px;border-radius:10px;flex:none}
.cl-pn{flex:1;min-width:0}.cl-pn b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cl-pn small{color:var(--ink2);font-size:12px}
.cl-check{flex:none;width:26px;height:26px;border-radius:50%;border:2px solid #C9D0C1;display:grid;place-items:center}
.cl-check svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.cl-pick[aria-pressed="true"] .cl-check{background:var(--accent);border-color:var(--accent)}.cl-pick[aria-pressed="true"] .cl-check svg{opacity:1}
.cl-new{display:flex;gap:8px;margin-top:14px}.cl-new input{flex:1;min-width:0;height:44px;border:1px solid var(--line);border-radius:12px;padding:0 12px;background:#fff;font-size:15px}
.cl-new input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}.cl-new .out{flex:none;height:44px;padding:0 14px}
.cl-acts{display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:16px}.cl-acts .blk{width:100%}
.cl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 12px;margin-top:10px}
.cl-card{border:0;background:none;padding:0;text-align:left;display:flex;flex-direction:column;gap:2px;color:var(--ink);min-width:0}
.cl-card b{font-size:15px;font-weight:800;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cl-card small{font-size:12.5px;color:var(--ink2)}
.cl-cover{position:relative;display:grid;gap:2px;aspect-ratio:1;border-radius:16px;overflow:hidden;background:var(--chip)}
.cl-cover.n1{grid-template-columns:1fr}.cl-cover.n2{grid-template-columns:1fr 1fr}.cl-cover.n3,.cl-cover.n4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.cl-cover.n3 .cl-ct:first-child{grid-row:span 2}
.cl-ct{position:relative;display:block;overflow:hidden;min-height:0}
.cl-cover.empty,.cl-cover.cl-plus{display:grid;place-items:center}.cl-cover svg{width:30px;height:30px;fill:none;stroke:#9AA592;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
.cl-card.add .cl-cover{background:none;border:1.5px dashed #C9D0C1}.cl-card.add .cl-cover svg{stroke:var(--accent)}
.cl-back{flex:none;width:40px;height:40px;margin:-6px 2px -6px -10px;border:0;background:none;display:grid;place-items:center}
.cl-back svg{width:22px;height:22px;fill:none;stroke:var(--ink);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.sh-h:has(.cl-back) h2{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-tools{display:flex;gap:8px;margin:8px 0 2px}.cl-tools .danger{border-color:var(--red);color:var(--red)}
.cl-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 10px;margin-top:12px}
.cl-cell{position:relative;min-width:0}
.cl-gc{width:100%;border:0;background:none;padding:0;text-align:left;display:flex;flex-direction:column;gap:3px;color:var(--ink)}
.cl-gph{position:relative;display:block;aspect-ratio:3/4;border-radius:14px;overflow:hidden;margin-bottom:5px}.cl-gph .cl-fb{padding:12px;font-size:15px;font-weight:900;line-height:1.25}
.cl-tt{font-size:14px;font-weight:700;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:keep-all}
.cl-mt{font-size:12px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cl-pr{font-size:13px;font-weight:800;color:#3D5414}
.cl-rm{position:absolute;right:6px;top:6px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(31,43,34,.72);display:grid;place-items:center}
.cl-rm svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  window.collections = { pickerSheet, onSaveButton, homeSheet };
})();
