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
  let session = null;
  let queue = Promise.resolve();
  let initialization;
  let pending = 0;
  const connection = { mode: configured ? "connecting" : "sample", error: null, pending: 0 };
  const columns = {
    cultural_events: "id,codename,guname,title,date,place,org_name,use_trgt,use_fee,is_free,main_img,strtdate,end_date,org_link,hmpg_addr,lat,lot,price_min,price_label,genre4,is_sample,source,user_id,meta,updated_at",
    culture_events: "id,title,category,raw_category,place,place_addr,gu,start_date,end_date,event_time,price,fee_text,lat,lng,image_url,homepage_url,source,benefit_rules",
    event_benefits: "id,rule_key,event_id,type,value,price_after,label,auto_extracted,user_id",
    places: "id,category,subcategory,name,price,ref_price,address,lat,lng,hours,note,source,is_sample,user_id,meta,updated_at",
    user_profiles: "user_id,nickname,birth,student_type,gu,soldier,interest_genres,demo_mode,noti_settings,extra_fields,updated_at",
    reviews: "id,target_type,target_id,user_id,nickname,rating,text,created_at,visited_at,companions,highlights,photo_url",
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
  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (_) { return {}; }
  }
  function write(value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return value; }
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
    if (response.status === 204 || response.headers.get("content-length") === "0") return null;
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
      authNotice = /access_denied/.test(code) ? "구글 로그인을 취소했어요." : "구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.";
      return null;
    }
    if (!hash.get("access_token")) return null;
    const tokens = { access_token: hash.get("access_token"), refresh_token: hash.get("refresh_token"), expires_in: Number(hash.get("expires_in")) || 3600, expires_at: Number(hash.get("expires_at")) || undefined };
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
  async function selectAll(table, filter = "") {
    const output = [];
    for (let offset = 0; ; offset += 200) {
      const where = ownTables.has(table) ? `&user_id=eq.${encodeURIComponent(userId())}` : "";
      const result = await request(`/rest/v1/${table}?select=${columns[table]}${where}${filter}&order=${table === "user_profiles" ? "user_id" : "id"}&limit=200&offset=${offset}`);
      output.push(...result);
      if (result.length < 200) return output;
    }
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
      invalid_credentials: "이메일 또는 비밀번호가 맞지 않아요.",
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
  const service = {
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
    getReviews: target => list("reviews").filter(r => r.target_id === target),
    // extra: { visited_at, companions[], highlights[], photo(dataURL) } — 컬처맵 리뷰 항목
    addReview: (targetId, text, targetType = "event", rating = null, extra = {}) => run(async () => {
      if (!nickname()) cache("nickname", randomNickname());
      const row = { id: uuid(), user_id: userId(), nickname: nickname(), rating: rating ? Number(rating) : null, target_type: targetType, target_id: targetId, text: String(text || "").trim() || null, created_at: now(),
        visited_at: extra.visited_at || null, companions: extra.companions && extra.companions.length ? extra.companions : null, highlights: extra.highlights && extra.highlights.length ? extra.highlights : null, photo_url: null };
      if (extra.photo) row.photo_url = configured ? await uploadPhoto(extra.photo) : extra.photo;
      if (configured) await insert("reviews", row);
      cache("reviews", [row, ...list("reviews")]); return row;
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
    takeAuthNotice: () => { const value = authNotice; authNotice = ""; return value; },
    // 로그아웃하면 새 게스트 계정으로 다시 시작한다.
    signOut: async () => {
      if (configured && session) { try { await request("/auth/v1/logout", { method: "POST" }); } catch (_) {} }
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USER_KEY);
      global.location.reload();
    },
    refresh: () => run(async () => { if (configured) await hydrate(); return { mode: connection.mode }; }),
    flush: () => queue,
    resetDemo: () => { localStorage.removeItem(STORAGE_KEY); return true; },
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
