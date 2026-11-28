/* 애플트립(@apple_spot_trip) 일본 산리오·키티 샵 지도 & 시즌 신상 */
(function () {
  "use strict";

  const ANCHORS = {
    tokyo: { label: "도쿄역 기준", lat: 35.681236, lng: 139.767125 },
    osaka: { label: "난바·신사이바시 기준", lat: 34.6687, lng: 135.5013 },
    kyoto: { label: "교토 가와라마치 기준", lat: 35.0037, lng: 135.7685 },
    fukuoka: { label: "하카타역 기준", lat: 33.5897, lng: 130.4207 }
  };

  const state = {
    data: null,
    mode: "map",
    city: "all",
    query: "",
    onlyExclusive: false,
    onlyTaxFree: false,
    selectedItemId: null,
    selectedShopId: null,
    itemCategory: "all",
    userPoint: null, // { lat, lng, label, isGps }
    map: null,
    markers: new Map(),
    userMarker: null
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(km) {
    if (km == null) return "";
    if (km < 1) return Math.round(km * 1000) + "m";
    if (km < 10) return km.toFixed(1) + "km";
    return Math.round(km) + "km";
  }

  function showToast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.hidden = true;
    }, 2400);
  }

  function getItemMap() {
    const m = new Map();
    if (!state.data) return m;
    for (const it of state.data.seasonal_items) m.set(it.id, it);
    return m;
  }

  function getFilteredShops() {
    if (!state.data) return [];
    const itemMap = getItemMap();
    const q = state.query.trim().toLowerCase();

    let list = state.data.shops.filter((s) => {
      if (state.city !== "all" && s.city !== state.city) return false;
      if (state.onlyExclusive && !s.exclusive_note) return false;
      if (state.onlyTaxFree && s.tax_free !== true) return false;
      if (state.selectedItemId && !(s.seasonal_item_ids || []).includes(state.selectedItemId)) {
        return false;
      }
      if (q) {
        const itemNames = (s.seasonal_item_ids || [])
          .map((id) => itemMap.get(id))
          .filter(Boolean)
          .map((it) => it.name_ko + " " + it.name_ja)
          .join(" ");
        const hay = [
          s.name_ko, s.name_ja, s.city_label, s.address, s.station,
          s.badge, s.exclusive_note || "", s.tips || "", itemNames
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (state.userPoint) {
      list = list
        .map((s) => ({
          ...s,
          _distKm: haversineKm(state.userPoint.lat, state.userPoint.lng, s.lat, s.lng)
        }))
        .sort((a, b) => a._distKm - b._distKm);
    }
    return list;
  }

  function initMap() {
    if (typeof window.L === "undefined") {
      const el = $("#map");
      if (el) {
        el.innerHTML = '<div style="padding:24px;text-align:center;color:#787986;">지도를 불러오는 중이거나 오프라인 상태예요. 아래 매장 카드의 구글맵 버튼을 눌러 바로 길찾기할 수 있어요!</div>';
      }
      return;
    }
    state.map = window.L.map("map", { zoomControl: true }).setView([35.6762, 139.6503], 11);
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19
    }).addTo(state.map);
  }

  function syncMap(shops) {
    if (!state.map || typeof window.L === "undefined") return;

    state.markers.forEach((m) => state.map.removeLayer(m));
    state.markers.clear();

    const bounds = [];
    for (const s of shops) {
      const hasEx = Boolean(s.exclusive_note);
      const isSel = state.selectedShopId === s.id;
      const cls = ["kitty-pin", hasEx ? "is-exclusive" : "", isSel ? "is-selected" : ""]
        .filter(Boolean)
        .join(" ");
      const icon = window.L.divIcon({
        className: "",
        html: '<div class="' + cls + '"><span>🎀</span></div>',
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -32]
      });

      const distText = s._distKm != null ? "<br><b>거리:</b> " + formatDistance(s._distKm) : "";
      const exText = s.exclusive_note ? '<br><span style="color:#b45309;">✨ 매장 한정판 있음</span>' : "";
      const popupHtml =
        '<div style="min-width:180px;font-family:inherit;">' +
        "<b>" + esc(s.name_ko) + "</b>" +
        '<div style="font-size:12px;color:#555;margin-top:2px;">' + esc(s.station) + distText + exText + "</div>" +
        '<div style="margin-top:8px;display:flex;gap:6px;">' +
        '<a href="' + esc(s.maps_url) + '" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:#e8557f;text-decoration:none;">구글맵 열기 →</a>' +
        "</div></div>";

      const marker = window.L.marker([s.lat, s.lng], { icon }).addTo(state.map);
      marker.bindPopup(popupHtml);
      marker.on("click", () => selectShop(s.id, false));
      state.markers.set(s.id, marker);
      bounds.push([s.lat, s.lng]);
    }

    if (state.userMarker) {
      state.map.removeLayer(state.userMarker);
      state.userMarker = null;
    }
    if (state.userPoint) {
      state.userMarker = window.L.circleMarker([state.userPoint.lat, state.userPoint.lng], {
        radius: 9,
        fillColor: "#2f6fed",
        color: "#ffffff",
        weight: 3,
        fillOpacity: 1
      }).addTo(state.map);
      state.userMarker.bindTooltip(state.userPoint.label, { direction: "top" });
    }

    if (bounds.length > 0 && !state.selectedShopId) {
      state.map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14 });
    }
  }

  function selectShop(shopId, panToMap) {
    state.selectedShopId = shopId;
    $$(".shop-card").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.shopId === shopId);
    });
    const card = document.querySelector('.shop-card[data-shop-id="' + shopId + '"]');
    if (card && !panToMap) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    const s = state.data.shops.find((x) => x.id === shopId);
    if (s && state.map && panToMap) {
      state.map.flyTo([s.lat, s.lng], 15, { duration: 0.6 });
      const marker = state.markers.get(shopId);
      if (marker) marker.openPopup();
    }
  }

  function renderShops() {
    const shops = getFilteredShops();
    const itemMap = getItemMap();
    const listEl = $("#shop-list");
    const emptyEl = $("#shop-empty");
    const countEl = $("#result-count");
    const sortEl = $("#sort-hint");

    countEl.textContent = "매장 " + shops.length + "곳";
    sortEl.textContent = state.userPoint
      ? state.userPoint.label + " 가까운 순"
      : "추천 순";

    // Active item banner
    const banner = $("#active-item-banner");
    if (state.selectedItemId && itemMap.has(state.selectedItemId)) {
      banner.hidden = false;
      $("#active-item-banner-text").textContent =
        "🎁 '" + itemMap.get(state.selectedItemId).name_ko + "' 판매 매장만 보는 중";
    } else {
      banner.hidden = true;
    }

    if (shops.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      syncMap([]);
      return;
    }
    emptyEl.hidden = true;

    listEl.innerHTML = shops
      .map((s) => {
        const distBadge =
          s._distKm != null
            ? '<span class="dist-badge">📍 ' + formatDistance(s._distKm) + "</span>"
            : "";
        const taxBadge =
          s.tax_free === true ? '<span class="badge badge-taxfree">Tax-Free</span>' : "";
        const exBox = s.exclusive_note
          ? '<div class="exclusive-box"><strong>✨ 매장 한정·특화:</strong> ' + esc(s.exclusive_note) + "</div>"
          : "";

        const ids = s.seasonal_item_ids || [];
        const previewPills = ids
          .slice(0, 3)
          .map((id) => {
            const it = itemMap.get(id);
            if (!it) return "";
            const shortName = it.name_ko.split("(")[0].trim();
            return (
              '<button type="button" class="item-pill" data-open-item="' +
              esc(id) +
              '">' +
              esc(shortName) +
              "</button>"
            );
          })
          .join("");
        const morePill =
          ids.length > 3
            ? '<span class="item-pill is-more">+' + (ids.length - 3) + "개 더</span>"
            : "";

        return (
          '<article class="shop-card' +
          (state.selectedShopId === s.id ? " is-selected" : "") +
          '" data-shop-id="' +
          esc(s.id) +
          '">' +
          '<div class="card-top">' +
          '<div><div class="card-badges">' +
          '<span class="badge badge-city">' + esc(s.city_label) + "</span>" +
          '<span class="badge badge-special">' + esc(s.badge) + "</span>" +
          taxBadge +
          "</div>" +
          '<h3 class="shop-name">' + esc(s.name_ko) + "</h3>" +
          '<p class="shop-name-ja">' + esc(s.name_ja) + "</p></div>" +
          distBadge +
          "</div>" +
          '<ul class="shop-info">' +
          "<li>🚇 " + esc(s.station) + "</li>" +
          "<li>🕒 " + esc(s.hours) + "</li>" +
          "</ul>" +
          exBox +
          (previewPills ? '<div class="card-items-preview">' + previewPills + morePill + "</div>" : "") +
          '<div class="card-actions">' +
          '<a class="btn-map" href="' + esc(s.maps_url) + '" target="_blank" rel="noopener">🗺️ 구글맵 길찾기</a>' +
          '<button type="button" class="btn-detail" data-detail-shop="' + esc(s.id) + '">🎁 신상·꿀팁 보기</button>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    syncMap(shops);
  }

  function classifyItem(it) {
    const avail = it.availability || "";
    if (it.id === "item-12" || it.category.includes("쿠지")) return "kuji";
    if (avail.includes("단독") || avail.includes("키디랜드") || avail.includes("한정")) return "exclusive";
    return "common";
  }

  function renderItems() {
    if (!state.data) return;
    const grid = $("#items-grid");
    const items = state.data.seasonal_items.filter((it) => {
      if (state.itemCategory === "all") return true;
      return classifyItem(it) === state.itemCategory;
    });

    grid.innerHTML = items
      .map((it) => {
        const shopsSelling = state.data.shops.filter((s) =>
          (s.seasonal_item_ids || []).includes(it.id)
        );
        const findBtn =
          shopsSelling.length > 0
            ? '<button type="button" class="btn-find-shop" data-filter-item="' +
              esc(it.id) +
              '">🗺️ 파는 매장 ' +
              shopsSelling.length +
              "곳 보기</button>"
            : '<span class="badge badge-city">일본 전국 편의점·양판점</span>';

        return (
          '<article class="item-card">' +
          "<div>" +
          '<div class="item-head">' +
          '<span class="badge badge-special">' + esc(it.category) + "</span>" +
          '<span class="badge badge-city">발매 ' + esc(it.release_date) + "</span>" +
          "</div>" +
          '<h3 class="item-title">' + esc(it.name_ko) + "</h3>" +
          '<p class="item-ja">' + esc(it.name_ja) + "</p>" +
          '<div class="item-price">💴 ' + esc(it.price_jpy) + "</div>" +
          '<p class="item-desc">' + esc(it.description) + "</p>" +
          '<p class="item-avail">📍 ' + esc(it.availability) + "</p>" +
          "</div>" +
          '<div class="item-footer">' +
          findBtn +
          '<a class="btn-official" href="' + esc(it.source_url) + '" target="_blank" rel="noopener">공식 안내 ↗</a>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function openShopModal(shopId) {
    const s = state.data.shops.find((x) => x.id === shopId);
    if (!s) return;
    const itemMap = getItemMap();
    const items = (s.seasonal_item_ids || []).map((id) => itemMap.get(id)).filter(Boolean);

    const exHtml = s.exclusive_note
      ? '<div class="exclusive-box"><strong>✨ 이 매장만의 한정·특화 포인트:</strong><br>' +
        esc(s.exclusive_note) +
        "</div>"
      : "";

    const itemsHtml = items
      .map(
        (it) =>
          '<div class="modal-item-box">' +
          "<strong>" + esc(it.name_ko) + " · " + esc(it.release_date) + "</strong>" +
          "<span>💴 " + esc(it.price_jpy) + "</span>" +
          "<span>" + esc(it.description) + "</span>" +
          "</div>"
      )
      .join("");

    $("#modal-body").innerHTML =
      '<div class="card-badges">' +
      '<span class="badge badge-city">' + esc(s.city_label) + "</span>" +
      '<span class="badge badge-special">' + esc(s.badge) + "</span>" +
      (s.tax_free === true ? '<span class="badge badge-taxfree">Tax-Free 확인</span>' : "") +
      "</div>" +
      '<h2 class="modal-title" id="modal-title">' + esc(s.name_ko) + "</h2>" +
      '<p class="modal-sub">' + esc(s.name_ja) + "</p>" +
      '<ul class="modal-list">' +
      "<li><b>주소:</b> " + esc(s.address) + "</li>" +
      "<li><b>가까운 역:</b> " + esc(s.station) + "</li>" +
      "<li><b>영업시간:</b> " + esc(s.hours) + "</li>" +
      "</ul>" +
      exHtml +
      '<div class="modal-section"><h4>✨ 매장 핵심 포인트</h4><ul class="modal-list">' +
      (s.highlights || []).map((h) => "<li>" + esc(h) + "</li>").join("") +
      "</ul></div>" +
      '<div class="modal-tip">💡 <b>여행자 꿀팁:</b> ' + esc(s.tips) + "</div>" +
      '<div class="modal-section"><h4>🎁 이 매장에서 보는 시즌 신상 · 한정 (' +
      items.length +
      "건)</h4>" +
      (itemsHtml || "<p>등록된 시즌 신상이 없어요.</p>") +
      "</div>" +
      '<div class="card-actions" style="margin-top:16px;">' +
      '<a class="btn-map" href="' + esc(s.maps_url) + '" target="_blank" rel="noopener">🗺️ 구글맵 길찾기</a>' +
      '<button type="button" class="btn-detail" id="modal-copy-addr">📋 일본어 주소 복사</button>' +
      "</div>";

    $("#modal-backdrop").hidden = false;
    $("#modal-copy-addr").onclick = () => {
      navigator.clipboard?.writeText(s.address);
      showToast("주소를 복사했어요!");
    };
  }

  function openItemModal(itemId) {
    const it = getItemMap().get(itemId);
    if (!it) return;
    $("#modal-body").innerHTML =
      '<div class="card-badges">' +
      '<span class="badge badge-special">' + esc(it.category) + "</span>" +
      '<span class="badge badge-city">발매 ' + esc(it.release_date) + "</span>" +
      "</div>" +
      '<h2 class="modal-title" id="modal-title">' + esc(it.name_ko) + "</h2>" +
      '<p class="modal-sub">' + esc(it.name_ja) + "</p>" +
      '<div class="item-price">💴 ' + esc(it.price_jpy) + "</div>" +
      '<p class="item-desc">' + esc(it.description) + "</p>" +
      '<p class="item-avail">📍 판매처: ' + esc(it.availability) + "</p>" +
      '<div class="card-actions" style="margin-top:16px;">' +
      '<a class="btn-map" href="' + esc(it.source_url) + '" target="_blank" rel="noopener">공식 페이지 ↗</a>' +
      '<button type="button" class="btn-detail" id="modal-filter-by-item">🗺️ 파는 매장만 지도에서 보기</button>' +
      "</div>";

    $("#modal-backdrop").hidden = false;
    $("#modal-filter-by-item").onclick = () => {
      $("#modal-backdrop").hidden = true;
      switchMode("map");
      state.selectedItemId = itemId;
      state.selectedShopId = null;
      renderShops();
    };
  }

  function switchMode(mode) {
    state.mode = mode;
    $("#view-map").hidden = mode !== "map";
    $("#view-items").hidden = mode !== "items";
    $("#tab-map").classList.toggle("is-active", mode === "map");
    $("#tab-items").classList.toggle("is-active", mode === "items");
    if (mode === "map" && state.map) {
      setTimeout(() => state.map.invalidateSize(), 60);
    }
  }

  function setAnchor(key) {
    const anc = ANCHORS[key];
    if (!anc) return;
    state.userPoint = { lat: anc.lat, lng: anc.lng, label: anc.label, isGps: false };
    state.city = key;
    state.selectedShopId = null;
    $$(".city-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.city === key));
    $$(".anchor-chip").forEach((b) => b.classList.toggle("is-active", b.dataset.anchor === key));
    $("#geo-locate-btn").classList.remove("is-active");
    const st = $("#geo-status");
    st.textContent = "📍 " + anc.label + "으로 가까운 샵부터 정렬했어요.";
    st.classList.add("is-ready");
    renderShops();
  }

  function locateUser() {
    const st = $("#geo-status");
    if (!navigator.geolocation) {
      st.textContent = "이 브라우저에서는 위치 기능을 지원하지 않아요. 위 도시 기준점을 눌러보세요!";
      return;
    }
    st.textContent = "현재 위치를 확인하고 있어요…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        state.userPoint = { lat, lng, label: "내 현재 위치", isGps: true };
        state.selectedShopId = null;
        $$(".anchor-chip").forEach((b) => b.classList.remove("is-active"));
        $("#geo-locate-btn").classList.add("is-active");
        const inJapan = lat >= 24 && lat <= 46 && lng >= 122 && lng <= 154;
        st.textContent = inJapan
          ? "📍 내 현재 위치 기준으로 가장 가까운 일본 샵부터 정렬했어요!"
          : "📍 현재 위치(일본 밖) 기준으로 거리를 계산했어요. 여행지 기준점을 누르면 현지 동선을 바로 볼 수 있어요!";
        st.classList.add("is-ready");
        renderShops();
      },
      () => {
        st.textContent = "위치 권한이 꺼져 있어요. 아래 여행지 기준점(도쿄·오사카·교토·후쿠오카)을 눌러보세요!";
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }

  function bindEvents() {
    $("#tab-map").addEventListener("click", () => switchMode("map"));
    $("#tab-items").addEventListener("click", () => switchMode("items"));

    $("#share-btn").addEventListener("click", async () => {
      const url = window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
          return;
        } catch (_) {}
      }
      await navigator.clipboard?.writeText(url);
      showToast("나눔용 페이지 링크를 복사했어요!");
    });

    $("#geo-locate-btn").addEventListener("click", locateUser);
    $$(".anchor-chip").forEach((btn) =>
      btn.addEventListener("click", () => setAnchor(btn.dataset.anchor))
    );

    $("#search-form").addEventListener("submit", (e) => e.preventDefault());
    $("#search-input").addEventListener("input", (e) => {
      state.query = e.target.value;
      $("#search-clear").hidden = !state.query;
      state.selectedShopId = null;
      renderShops();
    });
    $("#search-clear").addEventListener("click", () => {
      $("#search-input").value = "";
      state.query = "";
      $("#search-clear").hidden = true;
      renderShops();
    });

    $("#filter-exclusive").addEventListener("click", (e) => {
      state.onlyExclusive = !state.onlyExclusive;
      e.currentTarget.classList.toggle("is-active", state.onlyExclusive);
      state.selectedShopId = null;
      renderShops();
    });
    $("#filter-taxfree").addEventListener("click", (e) => {
      state.onlyTaxFree = !state.onlyTaxFree;
      e.currentTarget.classList.toggle("is-active", state.onlyTaxFree);
      state.selectedShopId = null;
      renderShops();
    });

    $$("#city-tabs .city-tab").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.city = btn.dataset.city;
        state.selectedShopId = null;
        $$("#city-tabs .city-tab").forEach((b) => {
          const act = b === btn;
          b.classList.toggle("is-active", act);
          b.setAttribute("aria-selected", act ? "true" : "false");
        });
        renderShops();
      })
    );

    $("#active-item-clear").addEventListener("click", () => {
      state.selectedItemId = null;
      renderShops();
    });

    $("#reset-filters-btn").addEventListener("click", () => {
      state.city = "all";
      state.query = "";
      state.onlyExclusive = false;
      state.onlyTaxFree = false;
      state.selectedItemId = null;
      state.selectedShopId = null;
      $("#search-input").value = "";
      $("#search-clear").hidden = true;
      $("#filter-exclusive").classList.remove("is-active");
      $("#filter-taxfree").classList.remove("is-active");
      $$("#city-tabs .city-tab").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.city === "all")
      );
      renderShops();
    });

    $("#shop-list").addEventListener("click", (e) => {
      const itemBtn = e.target.closest("[data-open-item]");
      if (itemBtn) {
        e.stopPropagation();
        openItemModal(itemBtn.dataset.openItem);
        return;
      }
      const detailBtn = e.target.closest("[data-detail-shop]");
      if (detailBtn) {
        e.stopPropagation();
        openShopModal(detailBtn.dataset.detailShop);
        return;
      }
      if (e.target.closest("a")) return;
      const card = e.target.closest(".shop-card");
      if (card) selectShop(card.dataset.shopId, true);
    });

    $$("#item-cat-tabs .city-tab").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.itemCategory = btn.dataset.icat;
        $$("#item-cat-tabs .city-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
        renderItems();
      })
    );

    $("#items-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter-item]");
      if (!btn) return;
      state.selectedItemId = btn.dataset.filterItem;
      state.city = "all";
      state.selectedShopId = null;
      $$("#city-tabs .city-tab").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.city === "all")
      );
      switchMode("map");
      renderShops();
    });

    $("#modal-close").addEventListener("click", () => {
      $("#modal-backdrop").hidden = true;
    });
    $("#modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") $("#modal-backdrop").hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") $("#modal-backdrop").hidden = true;
    });
  }

  async function boot() {
    let data = window.__APPLETRIP_DATA__ || null;
    if (!data) {
      const res = await fetch("./data/shops.json");
      data = await res.json();
    }
    state.data = data;
    $("#shop-total-badge").textContent = data.shops.length;
    $("#item-total-badge").textContent = data.seasonal_items.length;
    $("#season-pill").textContent = "❄️ " + data.season_label;
    $("#footer-updated").textContent = data.updated_at;

    initMap();
    bindEvents();
    renderShops();
    renderItems();
  }

  boot().catch((err) => {
    console.error(err);
  });
})();
