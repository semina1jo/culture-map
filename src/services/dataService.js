/* 모든 데이터 접근은 이 서비스가 담당한다. 공개 키만 브라우저에 주입한다. */
(function (global) {
  const STORAGE_KEY = "geojimap-demo-v1";
  const USER_KEY = "geojimap-user-id";
  const ENV = global.__ENV__ || {};
  const base = (ENV.SUPABASE_URL || "").replace(/\/$/, "");
  const configured = Boolean(base && ENV.SUPABASE_ANON_KEY);
  const SESSION_KEY = `geojimap-session:${base}`;
  const LINK_KEY = "geojimap-google-link";
  let authNotice = "";
  let recoveryPending = false;
  let session = null;
  let queue = Promise.resolve();
  let initialization;
  let pending = 0;
  const connection = { mode: configured ? "connecting" : "sample", error: null, pending: 0 };
  const columns = {
    cultural_events: "id,codename,guname,title,date,place,org_name,use_trgt,use_fee,is_free,main_img,strtdate,end_date,org_link,hmpg_addr,lat,lot,price_min,price_label,genre4,is_sample,source,user_id,meta,updated_at",
    culture_events: "id,title,category,raw_category,place,place_addr,gu,org_name,start_date,end_date,event_time,price,fee_text,lat,lng,image_url,homepage_url,ticket_url,source,benefits,benefit_rules,description,is_demo,hidden_reason",
    event_benefits: "id,rule_key,event_id,type,value,price_after,label,auto_extracted,user_id",
    places: "id,category,subcategory,name,price,ref_price,address,lat,lng,hours,note,source,is_sample,user_id,meta,updated_at",
    user_profiles: "user_id,nickname,birth,student_type,gu,soldier,interest_genres,demo_mode,noti_settings,extra_fields,updated_at",
    reviews: "id,target_type,target_id,user_id,nickname,rating,text,created_at,visited_at,companions,highlights,photo_url,verify_level,verify_meta,mod_status",
    reports: "id,tab,name,genre,subcategory,price,ref_price,start_date,end_date,address,lat,lng,photo_url,source_url,status,yes,ended,wrong,user_id,meta,created_at",
    report_votes: "id,report_id,user_id,vote,created_at",
    visits: "id,user_id,event_id,visit_date,verified_at,demo_mode,distance_m",
    saved: "id,user_id,target_type,target_id,created_at",
    notifications: "id,user_id,dedupe_key,type,text,target_id,read,created_at",
    review_likes: "id,review_id,user_id,created_at",
    review_flags: "id,review_id,user_id,reason,created_at",
    venue_benefits: "id,venue_keyword,venue_name,category,target,discount,note,source_url",
    situation_votes: "id,event_id,user_id,situation,created_at"
  };
  // 새로 추가된 테이블: 아직 DB에 없더라도 앱 전체가 멈추지 않게 실패를 무시한다
  const optionalTables = new Set(["review_likes", "review_flags", "venue_benefits", "situation_votes"]);
  const ownTables = new Set(["user_profiles", "visits", "saved", "notifications", "review_flags"]);
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const uuid = () => global.crypto.randomUUID();
  const now = () => new Date().toISOString();
  // 저장 데이터(약 2MB)를 매번 JSON.parse 하면 한 번에 9ms씩 걸려 화면이 크게 버벅였다(2026-11-20).
  // 한 번 읽은 값을 기억해 두고, 저장(write)·삭제·다른 탭에서 바뀔 때만 다시 읽는다
  // 공공데이터(culture_events, 저장 데이터의 95% 이상)는 따로 저장한다(2026-11-21).
  // 찜·알림·설정을 바꿀 때 2MB 전체를 다시 저장하지 않고, 공공데이터는 새로 받아 왔을 때만 저장한다
  const CULTURE_KEY = STORAGE_KEY + "-culture";
  let memo = null, savedCulture = null;
  function read() {
    if (memo) return memo;
    try { memo = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (_) { memo = {}; }
    if (Array.isArray(memo.culture_events)) savedCulture = null; // 예전 방식(한 덩어리)으로 저장된 기기: 다음 저장 때 분리
    else {
      try { const c = JSON.parse(localStorage.getItem(CULTURE_KEY) || "null"); if (Array.isArray(c)) { memo.culture_events = c; savedCulture = c; } }
      catch (_) {}
    }
    return memo;
  }
  function write(value) {
    memo = value;
    const { culture_events, ...rest } = value || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    if (Array.isArray(culture_events) && culture_events !== savedCulture) {
      // 공공데이터는 다시 받을 수 있으므로 저장 공간이 모자라도 앱을 멈추지 않는다
      try { localStorage.setItem(CULTURE_KEY, JSON.stringify(culture_events)); savedCulture = culture_events; } catch (_) {}
    }
    return value;
  }
  function clearStore() { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(CULTURE_KEY); memo = null; savedCulture = null; }
  global.addEventListener("storage", ev => { if (ev.key === STORAGE_KEY || ev.key === CULTURE_KEY || ev.key === null) { memo = null; savedCulture = null; } });
  function cache(key, value) { const state = read(); state[key] = value; write(state); return value; }
  function list(key) { const value = read()[key]; return Array.isArray(value) ? value : []; }
  function localUserId() {
    let id = localStorage.getItem(USER_KEY);
    if (!id) { id = `demo-user-${uuid()}`; localStorage.setItem(USER_KEY, id); }
    return id;
  }
  function userId() { return session?.user?.id || localUserId(); }
  function announce(type, detail) { global.dispatchEvent(new CustomEvent(type, { detail })); }
  function fail(error) {
    connection.error = { code: error.code || "connection_failed", message: error.message || "원격 연결 실패" };
    announce("geojimap:data-error", connection.error);
  }
  function apiHeaders(extra = {}) {
    const result = { apikey: ENV.SUPABASE_ANON_KEY, "content-type": "application/json", ...extra };
    if (session?.access_token) result.Authorization = `Bearer ${session.access_token}`;
    return result;
  }
  async function request(path, options = {}) {
    let response;
    try { response = await fetch(`${base}${path}`, { ...options, headers: apiHeaders(options.headers) }); }
    catch (_) { throw Object.assign(new Error("네트워크 연결을 확인해 주세요."), { code: "network_error" }); }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(body.message || body.msg || body.error_description || `Supabase 요청 실패 (${response.status})`), { code: body.code || body.error_code || String(response.status), status: response.status });
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") return options.withCount ? { rows: [], total: 0 } : null;
    if (options.withCount) {
      const total = Number(String(response.headers.get("content-range") || "").split("/")[1]);
      return { rows: (await response.json().catch(() => null)) || [], total: Number.isFinite(total) ? total : null };
    }
    return response.json().catch(() => null);
  }
  function setSession(value) {
    if (!value.access_token || !value.refresh_token || !value.user?.id) throw new Error("유효한 익명 세션이 없습니다.");
    session = { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600), user: { id: value.user.id, is_anonymous: Boolean(value.user.is_anonymous), email: value.user.email || "" } };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(USER_KEY, session.user.id);
  }
  async function refreshSession() {
    const value = await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) });
    setSession(value);
  }
  function oauthRedirect() { return `${global.location.origin}${global.location.pathname}`; }
  function cleanUrl() { global.history.replaceState(null, "", oauthRedirect()); }
  function googleSignInUrl() { return `${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(oauthRedirect())}`; }
  // 반환값: null(해당 없음) | "redirect"(다른 곳으로 이동 중) | 토큰 객체
  function readOAuthReturn() {
    const hash = new URLSearchParams(global.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(global.location.search);
    const code = hash.get("error_code") || query.get("error_code") || hash.get("error") || query.get("error");
    if (code) {
      const desc = hash.get("error_description") || query.get("error_description") || "";
      const linking = localStorage.getItem(LINK_KEY);
      localStorage.removeItem(LINK_KEY);
      cleanUrl();
      // 이미 다른 회원에 연결된 구글 계정이면, 그 회원으로 바로 로그인한다
      if (linking && /identity_already_exists|already/i.test(`${code} ${desc}`)) { global.location.href = googleSignInUrl(); return "redirect"; }
      if (/otp_expired|expired|invalid/i.test(`${code} ${desc}`) && !/access_denied/.test(code)) authNotice = "메일 속 링크가 만료됐거나 이미 사용됐어요. 비밀번호 재설정을 다시 요청해 주세요.";
      else authNotice = /access_denied/.test(code) ? "구글 로그인을 취소했어요." : "구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.";
      return null;
    }
    if (!hash.get("access_token")) return null;
    const tokens = { access_token: hash.get("access_token"), refresh_token: hash.get("refresh_token"), expires_in: Number(hash.get("expires_in")) || 3600, expires_at: Number(hash.get("expires_at")) || undefined, recovery: hash.get("type") === "recovery" };
    localStorage.removeItem(LINK_KEY);
    cleanUrl();
    return tokens;
  }
  async function authenticate() {
    if (ENV.SUPABASE_ANON_KEY.startsWith("sb_secret_")) throw new Error("서버용 키를 브라우저에 사용할 수 없습니다.");
    if (ENV.SUPABASE_ANON_KEY.startsWith("eyJ")) {
      try { if (JSON.parse(atob(ENV.SUPABASE_ANON_KEY.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role") throw new Error("server_key"); }
      catch (error) { if (error.message === "server_key") throw new Error("서버용 키를 브라우저에 사용할 수 없습니다."); }
    }
    const returned = readOAuthReturn();
    if (returned === "redirect") await new Promise(() => {});
    if (returned) {
      const previousUser = localStorage.getItem(USER_KEY);
      session = { access_token: returned.access_token, refresh_token: returned.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "" } };
      const user = await request("/auth/v1/user");
      setSession({ ...returned, user });
      // 다른 회원으로 들어왔다면 이전 게스트의 화면 기록은 비운다 (게스트 연결이면 같은 id라 그대로)
      if (previousUser && previousUser !== user.id) write({ remote_imported: true });
      // 비밀번호 재설정 메일의 링크로 들어온 경우: 로그인된 상태에서 새 비밀번호를 정하게 한다
      if (returned.recovery) { recoveryPending = true; authNotice = ""; return; }
      authNotice = previousUser === user.id ? "구글 계정을 연결했어요. 이제 회원으로 이용해요." : "구글 계정으로 로그인했어요.";
      return;
    }
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { session = null; }
    if (session?.refresh_token && session.user?.id) {
      if (session.expires_at < Date.now() / 1000 + 60) await refreshSession();
      else {
        try { await request("/auth/v1/user"); }
        catch (error) { if (error.status === 401 || error.status === 403) await refreshSession(); else throw error; }
      }
      return;
    }
    const value = await request("/auth/v1/signup", { method: "POST", body: JSON.stringify({ data: { app: "geojimap-demo" } }) });
    setSession(value);
  }
  function upsert(table, row, conflict = "id") {
    return request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
  }
  function insert(table, row) { return request(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }); }
  function remove(table, query) { return request(`/rest/v1/${table}?${query}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); }
  // 첫 페이지에서 전체 건수를 함께 받고, 나머지 페이지는 동시에 받는다(2026-11-21).
  // 예전엔 200건씩 차례로 받아 공공데이터 1,100여 건에 6번(약 2초) 걸렸다
  async function selectAll(table, filter = "") {
    const where = ownTables.has(table) ? `&user_id=eq.${encodeURIComponent(userId())}` : "";
    const order = table === "user_profiles" ? "user_id" : "id";
    const path = (offset, limit) => `/rest/v1/${table}?select=${columns[table]}${where}${filter}&order=${order}&limit=${limit}&offset=${offset}`;
    // 한 페이지가 크면 응답이 오래 걸려서(1,000건 ≈ 1.4초), 작은 페이지 여러 개를 동시에 받는다
    const PAGE = 250;
    const first = await request(path(0, PAGE), { headers: { Prefer: "count=exact" }, withCount: true });
    const output = first.rows;
    if (first.total == null) {
      // 전체 건수를 못 받으면 예전처럼 차례로 받는다
      for (let offset = output.length; output.length && output.length % PAGE === 0; offset += PAGE) {
        const more = await request(path(offset, PAGE)); output.push(...more); if (more.length < PAGE) break;
      }
      return output;
    }
    if (output.length >= first.total || !output.length) return output;
    const step = output.length; // 서버가 한 번에 주는 최대 건수 (PAGE 이하)
    const offsets = []; for (let o = step; o < first.total; o += step) offsets.push(o);
    const pages = await Promise.all(offsets.map(o => request(path(o, step))));
    pages.forEach(rows => output.push(...(rows || [])));
    return output;
  }

  function run(task) {
    pending += 1; connection.pending = pending;
    const work = queue.then(async () => {
      if (configured) {
        await initialization;
        if (connection.mode !== "remote") throw Object.assign(new Error(connection.error?.message || "Supabase 연결을 먼저 완료해 주세요."), { code: connection.error?.code || "not_connected" });
        if (session.expires_at < Date.now() / 1000 + 60) await refreshSession();
      }
      const value = await task();
      connection.error = null;
      return { ok: true, value };
    }).catch(error => { fail(error); return { ok: false, error: connection.error }; }).finally(() => { pending -= 1; connection.pending = pending; });
    queue = work.then(() => undefined);
    return work;
  }
  const savedProfile = row => row?.extra_fields?.has_profile === false || !row?.birth ? null : { birth: row.birth, student: row.student_type || "none", gu: row.gu || "", soldier: row.soldier, ...(row.extra_fields?.profile || {}) };
  // ---- 계정·닉네임 ----
  const NICK_A = ["알뜰한", "부지런한", "알찬", "산책하는", "호기심많은", "느긋한", "반짝이는", "꼼꼼한", "씩씩한", "조용한"];
  const NICK_B = ["다람쥐", "참새", "고양이", "너구리", "펭귄", "수달", "판다", "고슴도치", "부엉이", "햄스터"];
  function randomNickname() {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    return `${pick(NICK_A)} ${pick(NICK_B)}${Math.floor(100 + Math.random() * 900)}`;
  }
  function nickname() { return read().nickname || ""; }
  function account() {
    if (!configured) return { mode: "sample", isGuest: true, email: "", nickname: nickname() };
    return { mode: connection.mode, isGuest: !session || session.user.is_anonymous !== false || !session.user.email, email: session?.user?.email || "", nickname: nickname() };
  }
  async function ensureNickname() {
    if (nickname()) return;
    for (let tries = 0; tries < 6; tries += 1) {
      let value = randomNickname();
      if (nickTaken(value)) continue;
      cache("nickname", value);
      try {
        await upsert("user_profiles", profileRow(read().profile), "user_id");
        cache("nicknames", { ...(read().nicknames || {}), [userId()]: value });
        return;
      } catch (error) { if (error.code !== "23505") throw error; cache("nickname", ""); }
    }
  }
  function authError(error) {
    const map = {
      email_exists: "이미 가입된 이메일이에요. 로그인해 주세요.",
      user_already_exists: "이미 가입된 이메일이에요. 로그인해 주세요.",
      invalid_credentials: "이메일 또는 비밀번호가 맞지 않아요. 구글로 가입했다면 위의 'Google로 계속하기'를 눌러 주세요.",
      same_password: "지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.",
      over_email_send_rate_limit: "메일을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요.",
      weak_password: "비밀번호는 6자 이상으로 정해 주세요.",
      email_address_invalid: "이메일 형식을 확인해 주세요.",
      validation_failed: "이메일 형식을 확인해 주세요.",
      email_provider_disabled: "Supabase에서 이메일 로그인을 켜 주세요.",
      over_request_rate_limit: "잠시 후 다시 시도해 주세요."
    };
    return Object.assign(new Error(map[error.code] || error.message || "계정 처리에 실패했어요."), { code: `auth_${error.code || "failed"}` });
  }
  function profileRow(profile, state = read()) {
    return { user_id: userId(), nickname: state.nickname || null, birth: profile?.birth || null, student_type: profile?.student || "none", gu: profile?.gu || null, soldier: Boolean(profile?.soldier), interest_genres: state.app_state?.prefs?.genres || [], demo_mode: state.app_state?.demoMode ?? true, noti_settings: state.app_state?.prefs || {}, extra_fields: { has_profile: Boolean(profile), profile: profile || {}, benefit_enabled: Boolean(state.benefit_enabled), app_state: state.app_state || {} }, updated_at: now() };
  }
  function placeRow(p) {
    return { id: p.id, category: p.category || "기타", subcategory: p.subcategory || p.type || "기타", name: p.name, price: Number(p.price) || 0, ref_price: p.ref_price == null ? null : Number(p.ref_price), address: p.address || p.addr || "", lat: p.lat ?? null, lng: p.lng ?? null, hours: p.hours || "", note: p.note || "", source: p.source || "사용자 입력", is_sample: Boolean(p.is_sample), user_id: userId(), meta: { menu: p.menu, star: p.star || 0, cnt: p.cnt || 0, coupon: Boolean(p.coupon), comments: p.comments || [], x: p.x, y: p.y, isNew: Boolean(p.isNew), source_url: p.source_url, photo: p.photo, report_id: p.report_id, price_unit: p.price_unit }, updated_at: now() };
  }
  function eventRow(e) {
    return { id: e.id, codename: e.CODENAME || e.genre, guname: e.GUNAME || "마포구", title: e.TITLE || e.name, date: e.always_open ? "상시 운영" : e.DATE || `${e.start}~${e.end}`, place: e.PLACE || e.place, org_name: e.ORG_NAME || "사용자 제보", use_trgt: e.USE_TRGT || "누구나", use_fee: e.USE_FEE || (e.price === 0 ? "무료" : `${e.price}원`), is_free: e.IS_FREE || (e.price === 0 ? "무료" : "유료"), main_img: e.photo || e.MAIN_IMG || "", strtdate: e.always_open ? null : e.start || e.STRTDATE || null, end_date: e.always_open ? null : e.end || e.END_DATE || null, org_link: e.ORG_LINK || "", hmpg_addr: e.HMPG_ADDR || "", lat: e.lat ?? null, lot: e.lng ?? null, price_min: e.price_min ?? e.price ?? null, price_label: e.price_label || "", genre4: e.genre4 || e.genre, is_sample: Boolean(e.is_sample), source: e.src || "사용자 제보", user_id: userId(), meta: { ref: e.ref, hours: e.hours, reserve: Boolean(e.reserve), entry: e.entry, x: e.x, y: e.y, comments: e.comments || [], status: e.status, isNew: Boolean(e.isNew), report_id: e.report_id, always_open: Boolean(e.always_open) }, updated_at: now() };
  }
  const toPlace = p => {
    const place = { ...p.meta, ...p, meta: p.meta, lat: p.lat == null ? null : Number(p.lat), lng: p.lng == null ? null : Number(p.lng), addr: p.address || "", type: p.subcategory || "기타" };
    return typeof global.applyOtherPriceUnit === "function" ? global.applyOtherPriceUnit(place) : place;
  };
  const toEvent = e => ({ ...e.meta, ...e, CODENAME: e.codename, GUNAME: e.guname, TITLE: e.title, DATE: e.date, PLACE: e.place, ORG_NAME: e.org_name, USE_TRGT: e.use_trgt, USE_FEE: e.use_fee, IS_FREE: e.is_free, MAIN_IMG: e.main_img, STRTDATE: e.strtdate, END_DATE: e.end_date, ORG_LINK: e.org_link, HMPG_ADDR: e.hmpg_addr, LAT: e.lat, LOT: e.lot, name: e.title, genre: e.genre4 || e.codename || "체험", price: e.price_min, start: e.strtdate, end: e.end_date, lat: e.lat == null ? null : Number(e.lat), lng: e.lot == null ? null : Number(e.lot), src: e.source, photo: e.main_img || "", ben: [] });
  const toNotification = n => ({ ...n, db_id: n.id, id: n.dedupe_key, kind: n.type, time: new Date(n.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) });
  async function hydrate() {
    const tables = Object.keys(columns);
    const results = await Promise.all(tables.map(async table => {
      // 선택 테이블이 아직 DB에 없으면 null → 이 기기에 저장해 둔 값을 그대로 둔다
      if (optionalTables.has(table)) { try { return [table, await selectAll(table)]; } catch (_) { return [table, null]; } }
      if (table !== "culture_events") return [table, await selectAll(table)];
      try {
        const rows = await selectAll(table);
        return [table, rows.map(global.cultureEventsData.toEvent)];
      } catch (error) {
        // 새 피드만 실패한 경우 기존 연결과 마지막 정상 피드 캐시를 유지한다.
        fail(error);
        return [table, null];
      }
    }));
    const state = read();
    state.nicknames = await fetchNicknames();
    for (const [table, rows] of results) {
      if (rows === null && optionalTables.has(table)) continue;
      if (table === "user_profiles") {
        const p = rows[0];
        state.profile = savedProfile(p);
        state.nickname = p?.nickname || "";
        if (p) { state.benefit_enabled = Boolean(p.extra_fields?.benefit_enabled); state.app_state = p.extra_fields?.app_state || {}; }
      } else if (table === "cultural_events") state.cultural_events = rows.map(toEvent);
      else if (table === "culture_events") {
        if (rows !== null) state.culture_events = rows;
      }
      else if (table === "places") state.places = rows.map(toPlace);
      else if (table === "notifications") state.notifications = rows.map(toNotification);
      else if (table === "report_votes") state.report_votes = rows.map(r => ({ ...r, vote: r.vote === "yes" ? "right" : r.vote }));
      else state[table] = rows;
    }
    write(state);
    announce("geojimap:data-ready", { mode: connection.mode });
  }
  async function fetchNicknames() {
    try {
      const rows = await request("/rest/v1/rpc/public_nicknames", { method: "POST", body: "{}" });
      return Object.fromEntries((rows || []).map(r => [r.user_id, r.nickname]));
    } catch (_) { return read().nicknames || {}; }
  }
  const nickTaken = (value, map = read().nicknames || {}) => Object.entries(map).some(([uid, n]) => uid !== userId() && String(n).toLowerCase() === value.toLowerCase());
  async function importLocal(state) {
    if (state.profile || state.app_state || state.benefit_enabled) await upsert("user_profiles", profileRow(state.profile, state), "user_id");
    for (const s of state.saved || []) await upsert("saved", { user_id: userId(), target_type: s.target_type, target_id: s.target_id }, "user_id,target_type,target_id");
    for (const r of state.reviews || []) if (r.text && r.target_id) await insert("reviews", { user_id: userId(), nickname: state.nickname || null, rating: r.rating ?? null, target_type: r.target_type || "event", target_id: r.target_id, text: r.text, created_at: r.created_at || now() });
    for (const r of state.reports || []) if (r.id && r.name) await request("/rest/v1/reports?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ ...pickReport(r), user_id: userId() }) });
    for (const p of state.places || []) if (!p.is_sample && p.id && p.name) await upsert("places", placeRow(p));
  }
  function pickReport(r) {
    const result = {};
    for (const name of ["id","tab","name","genre","subcategory","price","ref_price","start_date","end_date","address","lat","lng","photo_url","source_url","meta","created_at"]) if (r[name] !== undefined) result[name] = r[name];
    return result;
  }
  async function start() {
    if (!configured) return { ok: true, mode: "sample" };
    const existing = read();
    try {
      await authenticate();
      if (!existing.remote_imported) {
        await importLocal(existing);
        cache("remote_imported", true);
      }
      connection.mode = "remote";
      await hydrate();
      try { await ensureNickname(); } catch (error) { fail(error); }
      await checkAdmin();
      announce("geojimap:account-change", account());
      return { ok: true, mode: "remote" };
    } catch (error) { connection.mode = "remote-error"; fail(error); return { ok: false, mode: "remote-error", error: connection.error }; }
  }
  function update(key, value) {
    cache(key, value);
    if (configured && ["benefit_enabled", "app_state"].includes(key)) run(async () => upsert("user_profiles", profileRow(read().profile), "user_id"));
    return value;
  }
  async function uploadPhoto(value) {
    if (!value || !value.startsWith("data:")) return value || "";
    const blob = await (await fetch(value)).blob();
    if (blob.size > 5 * 1024 * 1024) throw new Error("사진은 5MB 이하로 선택해 주세요.");
    if (!["image/jpeg","image/png","image/webp","image/gif"].includes(blob.type)) throw new Error("JPG, PNG, WebP, GIF 사진을 사용해 주세요.");
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[blob.type];
    const path = `${userId()}/${uuid()}.${extension}`;
    const response = await fetch(`${base}/storage/v1/object/report-photos/${path}`, { method: "POST", headers: apiHeaders({ "content-type": blob.type }), body: blob });
    if (!response.ok) throw new Error("사진 업로드에 실패했어요.");
    return `${base}/storage/v1/object/public/report-photos/${path}`;
  }
  // 승인 전 대표 이미지: 비공개 저장소(partner-proofs)에 올리고 경로만 돌려준다
  async function uploadPrivateImage(value) {
    if (!value || !value.startsWith("data:")) return null;
    const blob = await (await fetch(value)).blob();
    if (blob.size > 5 * 1024 * 1024) throw new Error("사진은 5MB 이하로 선택해 주세요.");
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[blob.type];
    if (!extension) throw new Error("JPG, PNG, WebP, GIF 사진을 사용해 주세요.");
    const path = `${userId()}/${uuid()}.${extension}`;
    const response = await fetch(`${base}/storage/v1/object/partner-proofs/${path}`, { method: "POST", headers: apiHeaders({ "content-type": blob.type }), body: blob });
    if (!response.ok) throw new Error("사진 업로드에 실패했어요.");
    return path;
  }
  // 비공개 이미지 경로들 → 잠깐 쓸 수 있는 주소(1시간)
  async function signImages(rows) {
    const paths = [...new Set(rows.map(r => r.image_path).filter(Boolean))];
    if (!configured || !paths.length) return rows;
    try {
      const signed = await request("/storage/v1/object/sign/partner-proofs", { method: "POST", body: JSON.stringify({ expiresIn: 3600, paths }) });
      const map = new Map((signed || []).filter(x => x.signedURL).map(x => [x.path, `${base}/storage/v1${x.signedURL}`]));
      return rows.map(r => r.image_path && map.has(r.image_path) ? { ...r, _img: map.get(r.image_path) } : r);
    } catch (_) { return rows; }
  }
  // 승인할 때: 비공개 이미지를 공개 저장소(report-photos)로 복사하고 주소를 신청에 적어 둔다
  async function publishImage(row) {
    if (!row.image_path || row.image_url) return row.image_url || null;
    const signed = await request(`/storage/v1/object/sign/partner-proofs/${row.image_path}`, { method: "POST", body: JSON.stringify({ expiresIn: 120 }) });
    const blob = await (await fetch(`${base}/storage/v1${signed.signedURL || signed.signedUrl}`)).blob();
    const path = `${userId()}/${uuid()}.${(row.image_path.split(".").pop() || "jpg")}`;
    const up = await fetch(`${base}/storage/v1/object/report-photos/${path}`, { method: "POST", headers: apiHeaders({ "content-type": blob.type || "image/jpeg" }), body: blob });
    if (!up.ok) throw new Error("대표 이미지를 공개하지 못했어요.");
    const url = `${base}/storage/v1/object/public/report-photos/${path}`;
    await request(`/rest/v1/culture_submissions?id=eq.${encodeURIComponent(row.id)}`, { method: "PATCH", body: JSON.stringify({ image_url: url }) });
    return url;
  }
  async function checkAdmin() {
    let value = false;
    if (configured && session && !account().isGuest) { try { value = (await request("/rest/v1/rpc/is_app_admin", { method: "POST", body: "{}" })) === true; } catch (_) { value = false; } }
    cache("is_admin", value);
    announce("geojimap:admin-change", { admin: value });
    return value;
  }
  // ---- 기록 탭 메모·사진·갈 날짜·영수증: 로그인한 계정에 저장 (2026-11-16, 전엔 기기 localStorage에만 있었음) ----
  const diaryEnabled = () => configured && connection.mode === "remote" && !account().isGuest;
  const quoteIn = keys => keys.map(k => `"${encodeURIComponent(String(k).replace(/"/g, '\\"'))}"`).join(",");
  const diaryApi = {
    enabled: diaryEnabled,
    pull: () => run(() => request(`/rest/v1/diary_entries?select=kind,key,date,memo,photo_url,data&user_id=eq.${encodeURIComponent(userId())}&limit=5000`)),
    // rows: [{kind, key, date, memo, photo_url, data}] — data:URL 사진은 저장소에 올리고 주소로 바꿔 저장
    push: rows => run(async () => {
      const out = [];
      // 여러 줄을 한 번에 넣으려면 모든 줄의 칸 구성이 같아야 한다
      for (const r of rows) out.push({ user_id: userId(), kind: r.kind, key: r.key, date: r.date ?? null, memo: r.memo ?? null, photo_url: r.photo_url ? await uploadPhoto(r.photo_url) : null, data: r.data ?? null, updated_at: now() });
      if (out.length) await request(`/rest/v1/diary_entries?on_conflict=user_id,kind,key`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(out) });
      return out;
    }),
    remove: (kind, keys) => keys.length ? run(() => remove("diary_entries", `user_id=eq.${encodeURIComponent(userId())}&kind=eq.${kind}&key=in.(${quoteIn(keys)})`)) : Promise.resolve({ ok: true }),
  };
  // 리뷰 방문 확인 칸 (2026-11-26). verify: { photo_check: "match"|"time"|"mismatch"|"none", ... }, ticket: dataURL
  // 티켓·예매 내역 사진이 있으면 '방문 인증'(ticket), 사진 촬영 시각·위치가 행사와 맞으면 '현장 사진'(photo)
  async function verifyFields(verify, ticket, cur = null) {
    const meta = { ...(cur?.verify_meta || {}), ...(verify || {}) };
    if (ticket) meta.ticket_path = configured ? await uploadPrivateImage(ticket) : "local";
    const level = meta.ticket_path ? "ticket" : meta.photo_check === "match" ? "photo" : null;
    return { verify_level: level, verify_meta: Object.keys(meta).length ? meta : null };
  }
  const service = {
    diary: diaryApi,
    get mode() { return connection.mode; },
    get status() { return { ...connection }; },
    userId, today, read, write, update,
    getEvents: () => [...list("cultural_events").filter(global.cultureEventsData.isLegacyVisible), ...list("culture_events")],
    getCultureEvents: () => list("culture_events"),
    getProfile: () => read().profile || null,
    saveProfile: profile => run(async () => {
      if (configured) await upsert("user_profiles", profileRow(profile), "user_id");
      cache("profile", profile); return profile;
    }),
    getBenefits: () => list("event_benefits"),
    saveBenefits: rules => run(async () => {
      const rows = list("event_benefits");
      for (const r of rules) {
        const value = r.value ?? null;
        const ruleKey = r.rule_key || JSON.stringify([r.event_id,r.type,value,r.price_after,userId()]);
        if (rows.some(b => b.rule_key === ruleKey)) continue;
        const row = { rule_key: ruleKey, event_id: r.event_id, type: r.type, value, price_after: Number(r.price_after), label: r.label, auto_extracted: Boolean(r.auto_extracted), user_id: userId() };
        if (configured) rows.push(...await upsert("event_benefits", row, "rule_key"));
        else rows.push({ ...row, id: uuid() });
      }
      cache("event_benefits", rows); return rows;
    }),
    // 관리자가 숨긴 리뷰는 본인에게만 보인다 (서버도 같은 규칙, 2026-11-26)
    getReviews: target => list("reviews").filter(r => r.target_id === target && (!["hidden","auto_hidden"].includes(r.mod_status) || r.user_id === userId())),
    // extra: { visited_at, companions[], highlights[], photo(dataURL) } — 컬처맵 리뷰 항목
    addReview: (targetId, text, targetType = "event", rating = null, extra = {}) => run(async () => {
      if (!nickname()) cache("nickname", randomNickname());
      const row = { id: uuid(), user_id: userId(), nickname: nickname(), rating: rating ? Number(rating) : null, target_type: targetType, target_id: targetId, text: String(text || "").trim() || null, created_at: now(),
        visited_at: extra.visited_at || null, companions: extra.companions && extra.companions.length ? extra.companions : null, highlights: extra.highlights && extra.highlights.length ? extra.highlights : null, photo_url: null };
      if (extra.photo) row.photo_url = configured ? await uploadPhoto(extra.photo) : extra.photo;
      Object.assign(row, await verifyFields(extra.verify, extra.ticket));
      if (configured) await insert("reviews", row);
      cache("reviews", [row, ...list("reviews")]); return row;
    }),
    // 내 리뷰 수정·삭제 (설정 > 내 활동 > 내 리뷰)
    updateReview: (id, patch = {}) => run(async () => {
      const cur = list("reviews").find(r => r.id === id);
      if (!cur || cur.user_id !== userId()) throw new Error("내 리뷰만 고칠 수 있어요.");
      const row = { rating: patch.rating ? Number(patch.rating) : cur.rating, text: String(patch.text ?? cur.text ?? "").trim() || null,
        visited_at: patch.visited_at ?? cur.visited_at ?? null, companions: patch.companions ? (patch.companions.length ? patch.companions : null) : cur.companions ?? null,
        highlights: patch.highlights ? (patch.highlights.length ? patch.highlights : null) : cur.highlights ?? null, photo_url: cur.photo_url ?? null };
      if (patch.photo !== undefined) row.photo_url = patch.photo ? (configured && patch.photo.startsWith("data:") ? await uploadPhoto(patch.photo) : patch.photo) : null;
      if (patch.verify !== undefined || patch.ticket) Object.assign(row, await verifyFields(patch.verify, patch.ticket, cur));
      if (configured) await request(`/rest/v1/reviews?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId())}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
      cache("reviews", list("reviews").map(r => r.id === id ? { ...r, ...row } : r)); return { ...cur, ...row };
    }),
    deleteReview: id => run(async () => {
      const cur = list("reviews").find(r => r.id === id);
      if (!cur || cur.user_id !== userId()) throw new Error("내 리뷰만 지울 수 있어요.");
      if (configured) await remove("reviews", `id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId())}`);
      cache("reviews", list("reviews").filter(r => r.id !== id)); cache("review_likes", list("review_likes").filter(l => l.review_id !== id)); return cur;
    }),
    nicknameOf: (uid, fallback = "") => (read().nicknames || {})[uid] || fallback,
    getLikes: reviewId => list("review_likes").filter(l => l.review_id === reviewId),
    likedByMe: reviewId => list("review_likes").some(l => l.review_id === reviewId && l.user_id === userId()),
    toggleLike: reviewId => run(async () => {
      const mine = list("review_likes").find(l => l.review_id === reviewId && l.user_id === userId());
      if (mine) {
        if (configured) await remove("review_likes", `review_id=eq.${reviewId}&user_id=eq.${userId()}`);
        cache("review_likes", list("review_likes").filter(l => l !== mine && !(l.review_id === reviewId && l.user_id === userId())));
        return false;
      }
      const row = { id: uuid(), review_id: reviewId, user_id: userId(), created_at: now() };
      if (configured) await request("/rest/v1/review_likes?on_conflict=review_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(row) });
      cache("review_likes", [...list("review_likes"), row]);
      return true;
    }),
    flaggedByMe: reviewId => list("review_flags").some(f => f.review_id === reviewId && f.user_id === userId()),
    flagReview: (reviewId, reason) => run(async () => {
      const row = { id: uuid(), review_id: reviewId, user_id: userId(), reason, created_at: now() };
      if (configured) await request("/rest/v1/review_flags?on_conflict=review_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(row) });
      cache("review_flags", [...list("review_flags").filter(f => f.review_id !== reviewId || f.user_id !== userId()), row]);
      return row;
    }),
    getVenueBenefits: () => list("venue_benefits"),
    // 방문 인증 때 남기는 '어울리는 상황' 투표. situation_votes 테이블이 없으면 이 기기에만 저장된다
    getSituationVotes: () => list("situation_votes"),
    addSituationVotes: async (eventId, situations) => {
      const uid = userId(), mine = list("situation_votes").filter(v => !(v.event_id === eventId && v.user_id === uid));
      const rows = situations.map(situation => ({ id: uuid(), event_id: eventId, user_id: uid, situation, created_at: now() }));
      cache("situation_votes", [...mine, ...rows]);
      let synced = false;
      if (configured && connection.mode === "remote" && session) {
        try {
          await request(`/rest/v1/situation_votes?event_id=eq.${encodeURIComponent(eventId)}&user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
          if (rows.length) await insert("situation_votes", rows.map(({ id, ...r }) => r));
          synced = true;
        } catch (_) { /* 테이블이 아직 없으면 이 기기에만 남긴다 */ }
      }
      return { ok: true, synced };
    },
    // ---- 관계자 등록 신청 → 관리자 심사 (2026-11-19) ----
    isAdmin: () => Boolean(read().is_admin),
    checkAdmin: () => run(checkAdmin),
    listSubmissions: all => run(async () => {
      if (!configured) return list("submissions");
      const mine = all ? "" : `&user_id=eq.${encodeURIComponent(userId())}`;
      const rows = await signImages(await request(`/rest/v1/culture_submissions?select=*${mine}&order=created_at.desc&limit=500`));
      if (!all) cache("submissions", rows);
      return rows;
    }),
    getMySubmissions: () => list("submissions"),
    addSubmission: (row, files = {}) => run(async () => {
      if (configured && account().isGuest) throw Object.assign(new Error("로그인한 뒤 신청할 수 있어요."), { code: "auth_required" });
      const data = { ...row, user_id: userId() };
      if (configured) {
        data.image_url = null;
        data.image_path = await uploadPrivateImage(files.image || "");
        let saved;
        try { saved = (await signImages(await insert("culture_submissions", data)))[0]; }
        catch (error) { if (/too_many_pending/.test(error?.message || "")) throw Object.assign(new Error("검사 대기 중인 신청이 5건이에요. 결과가 나온 뒤에 더 신청해 주세요."), { code: "too_many_pending" }); throw error; }
        cache("submissions", [saved, ...list("submissions").filter(r => r.id !== saved.id)]);
        return saved;
      }
      const saved = { ...data, id: uuid(), status: "대기", created_at: now(), image_url: files.image || null };
      cache("submissions", [saved, ...list("submissions")]);
      return saved;
    }),
    // 신청 고치기: 신청자는 대기·반려 건만(고치면 다시 대기), 관리자는 상태 유지
    updateSubmission: (id, patch, files = {}) => run(async () => {
      const data = { ...patch };
      // 승인된 신청은 고치면 지도에 바로 반영된다(2026-11-26). 새 대표 이미지는 공개 저장소(본인 폴더)에 바로 올린다
      const approved = (list("submissions").find(r => r.id === id) || {}).status === "승인" && !read().is_admin;
      if (configured) {
        if (files.image && approved) data.image_url = await uploadPhoto(files.image);
        else if (files.image) { data.image_path = await uploadPrivateImage(files.image); data.image_url = null; }
        let rows;
        try { rows = await request(`/rest/v1/culture_submissions?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) }); }
        catch (error) { if (/too_many_pending/.test(error?.message || "")) throw Object.assign(new Error("검사 대기 중인 신청이 5건이에요. 결과가 나온 뒤에 다시 신청해 주세요."), { code: "too_many_pending" }); throw error; }
        const saved = (await signImages(rows || []))[0]; if (!saved) throw new Error("고칠 수 없는 신청이에요. 이미 심사가 끝났을 수 있어요.");
        cache("submissions", list("submissions").map(r => r.id === id ? saved : r));
        if (saved.status === "승인") { try { cache("culture_events", (await selectAll("culture_events")).map(global.cultureEventsData.toEvent)); } catch (_) {} }
        return saved;
      }
      if (files.image) data.image_url = files.image;
      const cur = list("submissions").find(r => r.id === id) || {};
      const saved = { ...cur, ...data, ...(read().is_admin || cur.status === "승인" ? {} : { status: "대기", reject_reason: null, reject_kind: null, reviewed_at: null }) };
      cache("submissions", list("submissions").map(r => r.id === id ? saved : r));
      return saved;
    }),
    reviewSubmission: (id, action, reason, checks, row) => run(async () => {
      if (action === "approve" && row?.image_path && !row.image_url) await publishImage(row);
      // p_seen_at: 관리자가 화면에서 본 시점. 그 뒤 신청자가 고쳤으면 서버가 승인을 거부한다
      let result;
      try { result = await request("/rest/v1/rpc/review_culture_submission", { method: "POST", body: JSON.stringify({ p_id: id, p_action: action, p_reason: reason || null, p_checks: checks || {}, p_seen_at: row?.applicant_updated_at || null }) }); }
      catch (error) { if (/changed_since_view/.test(error?.message || "")) throw Object.assign(new Error("신청자가 방금 내용을 고쳤어요. 목록을 새로고침해서 다시 확인해 주세요."), { code: "changed_since_view" }); throw error; }
      try { cache("culture_events", (await selectAll("culture_events")).map(global.cultureEventsData.toEvent)); } catch (_) {}
      return result;
    }),
    // 관리자: 승인 후 신청자가 고친 이력
    listSubmissionEdits: submissionId => run(async () => {
      if (!configured) return [];
      return (await request(`/rest/v1/culture_submission_edits?select=changes,created_at&submission_id=eq.${encodeURIComponent(submissionId)}&order=created_at.desc&limit=20`)) || [];
    }),
    // ---- 지도 정보 신고 (2026-11-19) ----
    addCultureReport: row => run(async () => {
      if (configured && account().isGuest) throw Object.assign(new Error("로그인한 뒤 신고할 수 있어요."), { code: "auth_required" });
      const data = { ...row, user_id: userId() };
      if (configured) {
        try { const saved = (await insert("culture_reports", data))[0]; cache("culture_reports_mine", [saved, ...list("culture_reports_mine")]); return saved; }
        catch (error) { if (/duplicate|23505|unique/i.test(String(error?.message || error?.code || ""))) throw Object.assign(new Error("이미 신고한 정보예요. 관리자가 확인 중이에요."), { code: "duplicate" }); throw error; }
      }
      const saved = { ...data, id: uuid(), status: "접수", created_at: now() };
      cache("culture_reports_mine", [saved, ...list("culture_reports_mine")]);
      return saved;
    }),
    getMyCultureReports: () => list("culture_reports_mine"),
    listCultureReports: all => run(async () => {
      if (!configured) return all ? list("culture_reports_mine") : list("culture_reports_mine");
      const mine = all ? "" : `&user_id=eq.${encodeURIComponent(userId())}`;
      const rows = await request(`/rest/v1/culture_reports?select=*${mine}&order=created_at.desc&limit=1000`);
      if (!all) cache("culture_reports_mine", rows);
      return rows;
    }),
    handleCultureReport: (eventKey, action, note) => run(async () => {
      const result = await request("/rest/v1/rpc/handle_culture_report", { method: "POST", body: JSON.stringify({ p_event_key: eventKey, p_action: action, p_note: note || null }) });
      try { cache("culture_events", (await selectAll("culture_events")).map(global.cultureEventsData.toEvent)); } catch (_) {}
      return result;
    }),
    // 관리자: 이상 징후가 있는 리뷰 목록과 처리 (2026-11-26)
    listReviewAlerts: () => run(async () => {
      if (!configured) return [];
      const rows = await request("/rest/v1/rpc/admin_review_alerts", { method: "POST", body: "{}" });
      const signed = await signImages(rows.map(r => ({ ...r, image_path: r.verify_meta?.ticket_path && r.verify_meta.ticket_path !== "local" ? r.verify_meta.ticket_path : null })));
      return signed.map(r => ({ ...r, ticket_img: r._img || null }));
    }),
    moderateReview: (id, action, reason) => run(async () => {
      const row = await request("/rest/v1/rpc/admin_moderate_review", { method: "POST", body: JSON.stringify({ p_id: id, p_action: action, p_reason: reason || null }) });
      cache("reviews", list("reviews").map(r => r.id === id ? { ...r, mod_status: row.mod_status } : r));
      return row;
    }),
    // 관리자: 예시(더미) 신청 골라서 삭제. 지도에 올라간 예시도 함께 지운다
    deleteDemoSubmissions: ids => run(async () => {
      if (!configured) { const set = new Set(ids); cache("submissions", list("submissions").filter(r => !(set.has(r.id) && r.is_demo))); return ids.length; }
      const n = await request("/rest/v1/rpc/delete_demo_submissions", { method: "POST", body: JSON.stringify({ p_ids: ids }) });
      try { cache("culture_events", (await selectAll("culture_events")).map(global.cultureEventsData.toEvent)); } catch (_) {}
      cache("submissions", list("submissions").filter(r => !ids.includes(r.id)));
      return n;
    }),
    getMyReports: () => list("reports").filter(r => r.user_id === userId()),
    getMyReviews: () => list("reviews").filter(r => r.user_id === userId()),
    getReports: () => list("reports"),
    addReport: report => run(async () => {
      if (!nickname()) cache("nickname", randomNickname());
      // 제보에는 작성 당시 닉네임과 임시 닉네임 여부를 함께 남긴다
      const row = { ...pickReport(report), user_id: userId(), created_at: report.created_at || now(), meta: { ...(report.meta || {}), nickname: nickname(), guest: account().isGuest } };
      const item = report.item ? { ...report.item, report_id: report.id } : null;
      if (configured) {
        const photo = await uploadPhoto(row.photo_url || item?.photo || "");
        row.photo_url = photo;
        if (item) {
          item.photo = photo;
          if (row.tab === "문화") { item.MAIN_IMG = photo; await upsert("cultural_events", eventRow(item)); }
          else await upsert("places", placeRow({ ...item, category: row.tab }));
        }
        row.meta = { ...row.meta, item: item ? { ...item, photo } : undefined };
        const saved = await insert("reports", row); Object.assign(row, saved[0]);
      } else row.meta = { ...row.meta, item };
      cache("reports", [row, ...list("reports").filter(r => r.id !== row.id)]);
      if (item) {
        const key = row.tab === "문화" ? "cultural_events" : "places";
        cache(key, [{ ...item, user_id: userId(), category: row.tab }, ...list(key).filter(x => x.id !== item.id)]);
      }
      return row;
    }),
    getVotes: target => list("report_votes").filter(r => r.report_id === target),
    addVote: vote => run(async () => {
      const reportId = vote.report_id;
      if (vote.demo_mode) {
        cache("demo_votes", [...list("demo_votes"), { ...vote, id: uuid() }]);
        return { simulated: true };
      }
      const row = { id: uuid(), report_id: reportId, user_id: userId(), vote: vote.vote === "right" ? "yes" : vote.vote, created_at: now() };
      if (configured) { await insert("report_votes", row); const reports = await selectAll("reports"); cache("reports", reports); }
      cache("report_votes", [...list("report_votes"), { ...row, vote: row.vote === "yes" ? "right" : row.vote }]);
      return row;
    }),
    getVisits: () => list("visits"),
    addVisit: visit => run(async () => {
      const row = { id: uuid(), user_id: userId(), event_id: visit.event_id, visit_date: today(), demo_mode: Boolean(visit.demo_mode), distance_m: visit.distance_m || 0, verified_at: now() };
      if (configured) await insert("visits", row);
      cache("visits", [...list("visits"), row]); return row;
    }),
    recordVisit: (eventId, simulated, distance) => run(async () => {
      let result;
      if (configured) result = await request("/rest/v1/rpc/culture_record_visit", { method: "POST", body: JSON.stringify({ p_event_id: eventId, p_demo_mode: Boolean(simulated), p_distance_m: Number(distance) }) });
      else if (list("visits").some(v => v.event_id === eventId && v.visit_date === today())) result = { already: true };
      else result = { already: false, visit: { id: uuid(), user_id: userId(), event_id: eventId, visit_date: today(), demo_mode: Boolean(simulated), verified_at: now() } };
      if (result.visit) cache("visits", [...list("visits"), result.visit]);
      return result;
    }),
    getSaved: () => list("saved"),
    saveTarget: target => run(async () => {
      const row = { user_id: userId(), target_type: target.target_type, target_id: target.target_id };
      if (configured) { const result = await upsert("saved", row, "user_id,target_type,target_id"); Object.assign(row, result[0]); }
      cache("saved", [...list("saved").filter(s => !(s.target_id === row.target_id && s.target_type === row.target_type)), row]); return row;
    }),
    removeSaved: target => run(async () => {
      if (configured) await remove("saved", `user_id=eq.${userId()}&target_type=eq.${target.target_type}&target_id=eq.${encodeURIComponent(target.target_id)}`);
      cache("saved", list("saved").filter(s => !(s.target_id === target.target_id && s.target_type === target.target_type))); return true;
    }),
    getNotifications: () => list("notifications"),
    saveNotifications: notifications => {
      const before = list("notifications");
      const changed = notifications.filter(n => { const old = before.find(b => b.id === n.id); return !old || old.read !== n.read || old.text !== n.text; });
      cache("notifications", notifications);
      if (!changed.length) return Promise.resolve({ ok: true });
      return run(async () => {
        if (configured) for (const n of changed) {
          const row = { user_id: userId(), dedupe_key: String(n.id), type: n.kind || n.type || "app", text: n.text || "", target_id: n.target_id || n.id, read: Boolean(n.read), created_at: n.created_at || now() };
          const rows = await upsert("notifications", row, "user_id,dedupe_key");
          const current = list("notifications"); const found = current.find(x => x.id === n.id); if (found) { found.db_id = rows[0].id; found.created_at = rows[0].created_at; } cache("notifications", current);
        }
        return true;
      });
    },
    getPlaces: () => list("places"),
    savePlaces: places => run(async () => {
      for (const p of places.filter(x => !x.is_sample && (!x.user_id || x.user_id === userId()))) {
        const row = placeRow(p);
        if (configured) await upsert("places", row);
      }
      cache("places", places); return places;
    }),
    account,
    getNickname: nickname,
    setNickname: name => run(async () => {
      const value = String(name || "").trim();
      if (value.length < 2 || value.length > 12) throw Object.assign(new Error("닉네임은 2~12자로 정해 주세요."), { code: "auth_nickname" });
      const taken = Object.assign(new Error("이미 다른 사람이 쓰는 닉네임이에요."), { code: "auth_nickname_taken" });
      if (configured) {
        const map = await fetchNicknames();
        cache("nicknames", map);
        if (nickTaken(value, map)) throw taken;
      }
      const before = nickname();
      cache("nickname", value);
      if (configured) {
        try { await upsert("user_profiles", profileRow(read().profile), "user_id"); }
        catch (error) { cache("nickname", before); if (error.code === "23505") throw taken; throw error; }
        // 화면은 공개 닉네임으로 표시하지만, 리뷰에 남겨둔 닉네임 칸도 함께 맞춘다
        try { await request(`/rest/v1/reviews?user_id=eq.${encodeURIComponent(userId())}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ nickname: value }) }); } catch (_) {}
      }
      cache("nicknames", { ...(read().nicknames || {}), [userId()]: value });
      cache("reviews", list("reviews").map(r => r.user_id === userId() ? { ...r, nickname: value } : r));
      announce("geojimap:account-change", account());
      return value;
    }),
    // 지금 쓰던 게스트 계정에 이메일·비밀번호를 붙여 회원으로 전환한다. 계정 id가 그대로라 제보·리뷰 기록이 유지된다.
    signUpEmail: (email, password) => run(async () => {
      if (!configured) throw Object.assign(new Error("Supabase 연결 후 가입할 수 있어요."), { code: "auth_not_configured" });
      if (!account().isGuest) throw Object.assign(new Error("이미 로그인돼 있어요."), { code: "auth_already" });
      let user;
      try { user = await request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ email: String(email).trim() }) }); }
      catch (error) { throw authError(error); }
      if (!user?.email) throw Object.assign(new Error("가입 확인 메일이 필요한 설정이에요. Supabase에서 Confirm email을 꺼 주세요."), { code: "auth_confirm_required" });
      try { await request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password }) }); }
      catch (error) { throw authError(error); }
      await refreshSession();
      session.user.email = session.user.email || user.email;
      session.user.is_anonymous = false;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      announce("geojimap:account-change", account());
      return account();
    }),
    // 이미 가입한 계정으로 로그인한다. 지금 게스트로 남긴 기록은 게스트 계정에 남는다.
    signInEmail: (email, password) => run(async () => {
      if (!configured) throw Object.assign(new Error("Supabase 연결 후 로그인할 수 있어요."), { code: "auth_not_configured" });
      let value;
      try { value = await request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: String(email).trim(), password }) }); }
      catch (error) { throw authError(error); }
      setSession(value);
      write({ remote_imported: true });
      await hydrate();
      await ensureNickname();
      announce("geojimap:account-change", account());
      return account();
    }),
    // 구글 로그인: 게스트면 지금 계정에 구글을 연결하고(기록 유지), 아니면 구글 계정으로 로그인한다.
    signInGoogle: async () => {
      if (!configured) return { ok: false, error: { message: "Supabase 연결 후 이용할 수 있어요." } };
      await initialization;
      if (session && account().isGuest) {
        try {
          const value = await request(`/auth/v1/user/identities/authorize?provider=google&redirect_to=${encodeURIComponent(oauthRedirect())}&skip_http_redirect=true`);
          if (value?.url) { localStorage.setItem(LINK_KEY, "1"); global.location.href = value.url; return { ok: true }; }
        } catch (_) { /* 수동 연결이 꺼져 있으면 일반 구글 로그인으로 진행 */ }
      }
      global.location.href = googleSignInUrl();
      return { ok: true };
    },
    // 아이디 찾기: 닉네임 또는 이메일로 가입 정보(가린 이메일, 가입 방법)를 찾는다
    findAccount: async query => {
      if (!configured) return { ok: false, error: { message: "Supabase 연결 후 이용할 수 있어요." } };
      await initialization;
      try {
        const rows = await request("/rest/v1/rpc/find_account", { method: "POST", body: JSON.stringify({ p_query: String(query || "").trim() }) });
        return { ok: true, value: rows || [] };
      } catch (error) {
        return { ok: false, error: { message: error.code === "network_error" ? error.message : "지금은 계정을 찾을 수 없어요. 잠시 후 다시 시도해 주세요." } };
      }
    },
    // 비밀번호 재설정 메일 보내기. 가입 여부와 상관없이 같은 결과를 돌려준다(가입 여부 노출 방지)
    requestPasswordReset: async email => {
      if (!configured) return { ok: false, error: { message: "Supabase 연결 후 이용할 수 있어요." } };
      try {
        await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(oauthRedirect())}`, { method: "POST", body: JSON.stringify({ email: String(email).trim(), redirect_to: oauthRedirect() }) });
        return { ok: true };
      } catch (error) { return { ok: false, error: authError(error) }; }
    },
    takeRecovery: () => { const value = recoveryPending; recoveryPending = false; return value; },
    // 재설정 링크로 들어온 뒤(또는 로그인 상태에서) 새 비밀번호를 저장한다
    updatePassword: password => run(async () => {
      if (!configured) throw Object.assign(new Error("Supabase 연결 후 이용할 수 있어요."), { code: "auth_not_configured" });
      if (account().isGuest) throw Object.assign(new Error("재설정 링크가 만료됐어요. 다시 요청해 주세요."), { code: "auth_session_missing" });
      try { await request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password }) }); }
      catch (error) { throw authError(error); }
      await ensureNickname();
      announce("geojimap:account-change", account());
      return account();
    }),
    takeAuthNotice: () => { const value = authNotice; authNotice = ""; return value; },
    // 로그아웃하면 새 게스트 계정으로 다시 시작한다.
    signOut: async () => {
      if (configured && session) { try { await request("/auth/v1/logout", { method: "POST" }); } catch (_) {} }
      localStorage.removeItem(SESSION_KEY);
      clearStore();
      localStorage.removeItem(USER_KEY);
      global.location.reload();
    },
    refresh: () => run(async () => { if (configured) await hydrate(); return { mode: connection.mode }; }),
    flush: () => queue,
    resetDemo: () => { clearStore(); return true; },
    parseCsv(text) {
      const rows = []; let row = [], cell = "", quoted = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i], next = text[i + 1];
        if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; }
        else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && next === "\n") i += 1; row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
        else cell += ch;
      }
      if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
      const headers = rows.shift() || [];
      return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
    }
  };
  global.dataService = service;
  initialization = start();
  service.ready = initialization;
})(window);
