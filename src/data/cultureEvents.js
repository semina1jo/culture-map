/* 자동 수집 문화행사의 읽기 전용 UI 매핑. 테이블/수집 원본은 변경하지 않는다. */
(function (global) {
  const publicInstitution = /구립|시립|국립|국공립|구민회관|구청|시청|문화재단/;
  const replacedSource = /서울시|공공데이터/;
  const reportSource = /제보/;
  const hiddenSampleIds = new Set(["e10", "e18", "e19"]);

  function nullableNumber(value, min, max) {
    if (value == null || (typeof value !== "number" && typeof value !== "string")) return null;
    if (typeof value === "string" && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function dateOnly(value) {
    return typeof value === "string" && value.trim() ? value.slice(0, 10) : null;
  }

  function toEvent(row) {
    const lat = nullableNumber(row.lat, -90, 90);
    const lng = nullableNumber(row.lng, -180, 180);
    const price = nullableNumber(row.price, 0, Number.MAX_VALUE);
    const homepage = typeof row.homepage_url === "string" ? row.homepage_url.trim() : "";
    const source = row.source || "서울시 문화행사 정보";
    const hasCoordinates = lat !== null && lng !== null;
    // 상설 시설(박물관·미술관·궁궐)은 기간 없이 '상시 운영'으로 표시한다
    const permanent = /^상설 시설/.test(source) || !row.end_date;

    return {
      ...row,
      id: "culture_events_" + String(row.id),
      public_id: row.id,
      is_public_culture: true,
      // 사용자가 등록 신청하고 관리자가 승인한 정보
      is_partner: /관계자 등록|장소 등록/.test(source),
      is_sample: false,
      name: row.title,
      TITLE: row.title,
      genre: row.category,
      genre4: row.category,
      start: dateOnly(row.start_date),
      end: dateOnly(row.end_date),
      hours: row.event_time,
      price,
      price_min: price,
      price_label: price === null ? "" : price === 0 ? "무료" : `${price.toLocaleString('ko-KR')}원~`,
      USE_FEE: row.fee_text,
      fee_text: row.fee_text,
      source,
      src: source,
      place: row.place,
      PLACE: row.place,
      photo: row.image_url,
      MAIN_IMG: row.image_url,
      homepage_url: homepage,
      ORG_LINK: homepage,
      HMPG_ADDR: homepage,
      lat,
      lng,
      x: hasCoordinates ? 500 + (lng - 126.9245) / 0.000018 : null,
      y: hasCoordinates ? 660 - (lat - 37.5572) / 0.000012 : null,
      // 요금 문구에서 자동으로 뽑은 대상별 혜택가 (예: 청소년 1,800원, 학생 50% 할인)
      ben: (Array.isArray(row.benefit_rules) ? row.benefit_rules : []).map(rule => ({ ...rule, auto_extracted: true })),
      comments: [],
      votes: { went: 0, ended: 0, wrong: 0 },
      reserve: false,
      entry: permanent ? "상시 관람 (휴관일은 운영 시간에서 확인)" : "홈페이지에서 확인",
      is_permanent_place: permanent,
      always_open: permanent
    };
  }

  function isLegacyVisible(event) {
    if (!event) return false;
    // 2026-11-19: 관계자 등록 → 관리자 승인 체계로 바꾸면서, 심사를 거치지 않은 옛 사용자 제보는 지도에 올리지 않는다.
    if (event.report_id || event.meta?.report_id) return false;
    const sources = [event.source, event.src, event.meta?.source].filter(value => typeof value === "string");
    if (sources.some(source => reportSource.test(source))) return false;
    if (sources.some(source => replacedSource.test(source))) return false;
    if (event.is_sample !== true) return true;
    if (hiddenSampleIds.has(String(event.id))) return false;
    // 공원·마을도서관·광장·공연장·대학이라는 일반 명칭만으로는 숨기지 않는다.
    const institutionNames = [event.name, event.TITLE, event.title, event.place, event.PLACE, event.ORG_NAME, event.org_name];
    return !institutionNames.some(name => typeof name === "string" && publicInstitution.test(name));
  }

  global.cultureEventsData = { toEvent, isLegacyVisible };
})(window);
