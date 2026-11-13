/* /env.js의 브라우저용 환경변수로 Google 지도 SDK를 불러온다. */
(function (global) {
  const CENTER = { lat: 37.5572, lng: 126.9245 };
  let map = null;
  let overlay = null;
  let started = false;
  let timer;
  let resolveReady;
  const listeners = new Set();
  const idleListeners = new Set();
  const ready = new Promise(resolve => { resolveReady = resolve; });

  function setStatus(message) {
    const node = document.getElementById("mapStatus");
    if (node) { node.textContent = message; node.hidden = !message; }
  }
  function notify() { listeners.forEach(listener => listener()); }
  function scriptUrl() {
    const env = global.__ENV__ || {};
    if (env.mapsScriptUrl) return env.mapsScriptUrl;
    if (!env.googleMapsApiKey) return "";
    return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(env.googleMapsApiKey)}&libraries=geometry`;
  }
  function fail(message) {
    clearTimeout(timer);
    setStatus(message);
    resolveReady(null);
  }
  function init() {
    if (started) return ready;
    started = true;
    const url = scriptUrl();
    if (!url) { fail("Google 지도 환경변수가 아직 설정되지 않았어요"); return ready; }
    const start = () => {
      if (!global.google?.maps?.Map) { fail("Google 지도 SDK를 불러오지 못했어요"); return; }
      try {
        map = new global.google.maps.Map(document.getElementById("gmap"), {
          center: CENTER,
          zoom: 14,
          minZoom: 11,
          maxZoom: 19,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          cameraControl: false,
          panControl: false,
          zoomControl: false,
          gestureHandling: "greedy",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#f3f2ee" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#565b60" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
            // 시설 이름과 건물은 유지하고, 가격 핀과 겹치는 일반 POI 아이콘만 숨긴다.
            { featureType: "poi", elementType: "labels.text", stylers: [{ visibility: "on" }] },
            { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
            { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#e1ded7" }, { visibility: "on" }] },
            { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#c5c1b9" }, { visibility: "on" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d4cfc5" }] },
            { featureType: "road", elementType: "labels.text", stylers: [{ visibility: "on" }] },
            { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#eee2c6" }] },
            { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#d6ead0" }] },
            { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#cce1c2" }, { visibility: "on" }] },
            { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#52734c" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#bfdcec" }] },
            { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#527d96" }] },
            { featureType: "transit", elementType: "geometry", stylers: [{ visibility: "on" }] },
            { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#b7bbc4" }] },
            { featureType: "transit", elementType: "labels.text", stylers: [{ visibility: "on" }] },
            { featureType: "transit.station", elementType: "labels.icon", stylers: [{ visibility: "on" }] },
            { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#3e5f86" }] }
          ]
        });
        // 기존 가격 핀의 디자인은 그대로, 배치 좌표만 Google 투영을 사용한다.
        overlay = new global.google.maps.OverlayView();
        overlay.onAdd = () => {};
        overlay.onRemove = () => {};
        overlay.draw = () => {
          clearTimeout(timer);
          document.getElementById("gmap").classList.add("ready");
          setStatus("");
          notify();
          resolveReady(map);
        };
        overlay.setMap(map);
        map.addListener("idle", () => { notify(); idleListeners.forEach(listener => listener()); });
      } catch (_) { map = null; fail("Google 지도를 초기화하지 못했어요"); }
    };
    global.__geojimapMapsReady = start;
    global.gm_authFailure = () => { map = null; fail("지도 인증에 실패했어요. 환경변수와 허용 출처를 확인해 주세요"); };
    const script = document.createElement("script");
    script.src = url.includes("callback=") ? url : `${url}${url.includes("?") ? "&" : "?"}callback=__geojimapMapsReady`;
    script.async = true;
    // 프록시가 Origin을 검사한다. 일반 script 요청에는 없으므로 CORS 모드가 필수다.
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "origin";
    script.onerror = () => fail("Google 지도를 불러오지 못했어요. 네트워크와 지도 환경변수를 확인해 주세요");
    timer = setTimeout(() => fail("Google 지도 응답이 지연되고 있어요. 잠시 후 새로고침해 주세요"), 15000);
    document.head.appendChild(script);
    return ready;
  }
  function project(location) {
    const projection = overlay?.getProjection();
    if (!projection || !Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return null;
    return projection.fromLatLngToContainerPixel(new global.google.maps.LatLng(location.lat, location.lng));
  }
  function unproject(x, y) {
    return overlay?.getProjection()?.fromContainerPixelToLatLng(new global.google.maps.Point(x, y))?.toJSON() || null;
  }
  function fromWorld(x, y) { return { lat: CENTER.lat + (660 - y) * 0.000012, lng: CENTER.lng + (x - 500) * 0.000018 }; }
  function toWorld(location) { return { x: 500 + (location.lng - CENTER.lng) / 0.000018, y: 660 - (location.lat - CENTER.lat) / 0.000012 }; }
  function getMap() { return map; }
  function center() { if (map) map.setCenter(CENTER); }
  function zoom(factor) { if (map) map.setZoom(Math.max(11, Math.min(19, map.getZoom() + (factor > 1 ? 1 : -1)))); }
  function panTo(location) { if (map && location) map.panTo(location); }
  // 지금 화면 범위에 사방으로 padRatio만큼 여유를 더한 범위 (지도를 조금 움직여도 핀이 바로 보이도록)
  function visibleBounds(padRatio = 0.25) {
    const b = map?.getBounds(); if (!b) return null;
    const ne = b.getNorthEast(), sw = b.getSouthWest();
    const dLat = (ne.lat() - sw.lat()) * padRatio, dLng = (ne.lng() - sw.lng()) * padRatio;
    return { n: ne.lat() + dLat, s: sw.lat() - dLat, e: ne.lng() + dLng, w: sw.lng() - dLng };
  }
  function contains(location) { return !!map?.getBounds()?.contains(location); }
  function distance(a, b) {
    const rad = v => v * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))));
  }
  function directionsUrl(item) {
    const destination = item && item.lat && item.lng ? `${item.lat},${item.lng}` : encodeURIComponent(item && (item.place || item.address) || "홍대입구역");
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  }
  global.mapsService = { CENTER, init, ready, getMap, center, zoom, panTo, project, unproject, fromWorld, toWorld, contains, visibleBounds, distance, directionsUrl, onIdle: callback => { idleListeners.add(callback); return () => idleListeners.delete(callback); }, onChange: callback => { listeners.add(callback); return () => listeners.delete(callback); } };
})(window);
