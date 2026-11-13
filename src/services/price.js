/* 서울시 문화행사 USE_FEE 가격 처리 규칙 */
(function (global) {
  function extractAmounts(text) {
    const source = String(text || "").replace(/,/g, "");
    const amounts = [];
    const won = /([0-9]+(?:\.[0-9]+)?)\s*만\s*원/g;
    const numeric = /([0-9]{3,8})\s*원/g;
    let match;
    while ((match = won.exec(source))) amounts.push(Math.round(Number(match[1]) * 10000));
    while ((match = numeric.exec(source))) amounts.push(Number(match[1]));
    return amounts.filter(Number.isFinite);
  }
  function parseFee(event) {
    const fee = String(event.USE_FEE || event.use_fee || "").trim();
    if (String(event.IS_FREE || event.is_free || "").includes("무료") || fee === "무료" || /^무료(?:\s|$)/.test(fee)) {
      return { price_min: 0, price_label: "무료", amounts: [] };
    }
    const amounts = extractAmounts(fee);
    if (!amounts.length) return { price_min: null, price_label: "가격 확인", amounts: [] };
    const min = Math.min(...amounts);
    return { price_min: min, price_label: amounts.length > 1 ? `${min.toLocaleString("ko-KR")}원~` : `${min.toLocaleString("ko-KR")}원`, amounts };
  }
  global.priceService = { extractAmounts, parseFee };
})(window);
