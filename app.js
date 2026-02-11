
(function(){
  const DATA = window.ADOT_DATA || {branches:[], schools:[]};
  const branches = DATA.branches || [];
  const schools = DATA.schools || [];

  const $ = (id)=>document.getElementById(id);

  const branchSelect = $("branchSelect");
  const resultBody = $("resultBody");
  const kpiCount = $("kpiCount");
  const kpiStudents = $("kpiStudents");
  const kpiNearest = $("kpiNearest");
  const pillBranch = $("pillBranch");
  const pillAddress = $("pillAddress");
  const nearBranchBox = $("nearBranchBox");

  const schoolSearch = $("schoolSearch");
  const schoolSuggest = $("schoolSuggest");

  let radiusKm = 3;
  let typeFilter = "all";
  let selectedBranchId = "";
  let selectedSchool = null;

  let markerBySchoolId = new Map();
  let currentWithinById = new Map();

  // Map
  const map = L.map("map", { zoomControl: true }).setView([36.5, 127.9], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const cluster = L.markerClusterGroup({ disableClusteringAtZoom: 14, showCoverageOnHover: false });
  map.addLayer(cluster);

  
  const branchesLayer = L.layerGroup().addTo(map);
  const branchMarkers = new Map();
const circleLayer = L.layerGroup().addTo(map);
  const focusLayer = L.layerGroup().addTo(map);

  const iconBranch = L.divIcon({
    className: "adot-branch-icon",
    html: `<div class="branchLogo"><img src="assets/adot_logo.png" alt="A.DOT" /></div>`,
    iconSize: [34,34],
    iconAnchor: [17,17]
  });

  const iconBranchSelected = L.divIcon({
    className: "adot-branch-icon adot-branch-icon-selected",
    html: `<div class="branchLogo branchLogoSelected"><img src="assets/adot_logo.png" alt="A.DOT" /></div>`,
    iconSize: [44,44],
    iconAnchor: [22,22]
  });

function iconSchool(type){
    const color = type === "고등학교" ? "#3aa0ff" : "#34d399";
    return L.divIcon({
      className: "adot-school-icon",
      html: `<div style="width:16px;height:16px;border-radius:999px;background:${color};box-shadow:0 0 0 7px rgba(0,0,0,.20),0 0 0 5px rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.70)"></div>`,
      iconSize: [16,16],
      iconAnchor: [8,8]
    });
  }

  function iconSchoolSelected(type){
    const color = type === "고등학교" ? "#3aa0ff" : "#34d399";
    return L.divIcon({
      className: "adot-school-icon adot-school-icon-selected",
      html: `<div style="width:32px;height:32px;border-radius:999px;background:${color};box-shadow:0 0 0 9px rgba(245,130,33,.20), 0 0 22px rgba(245,130,33,.60);border:1px solid rgba(255,255,255,.80)"></div>`,
      iconSize: [32,32],
      iconAnchor: [16,16]
    });
  }


  function haversineKm(lat1, lon1, lat2, lon2){
    const R = 6371;
    const toRad = (d)=> d * Math.PI / 180;
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }
  function fmtKm(km){
    if (km < 10) return km.toFixed(2) + "km";
    return km.toFixed(1) + "km";
  }
  function fmtInt(n){
    try{ return Number(n).toLocaleString("ko-KR"); }catch(e){ return String(n); }
  }

  function populateBranches(){
    branchSelect.innerHTML = '<option value="">지점을 선택하세요</option>';
    branches.forEach(b=>{
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      branchSelect.appendChild(opt);
    });
  }

  function branchPopupHtml(b){
    return `
      <div style="font-family:Pretendard, system-ui; min-width:220px;">
        <div style="font-weight:800; margin-bottom:4px; color:#fff;">${escapeHtml(b.name)}</div>
        <div style="font-size:12px; color:rgba(255,255,255,.75); margin-bottom:8px;">
          ${escapeHtml(b.address||"")}
        </div>
        <div style="font-size:12px; color:rgba(255,255,255,.75);">
          지점을 선택하면 반경 내 학교가 표시됩니다.
        </div>
      </div>
    `;
  }

  function renderAllBranches(){
    branchesLayer.clearLayers();
    branchMarkers.clear();

    const latlngs = [];
    for(const b of branches){
      if(typeof b.lat !== "number" || typeof b.lng !== "number") continue;
      const m = L.marker([b.lat, b.lng], { icon: iconBranch }).addTo(branchesLayer);
      m.bindPopup(branchPopupHtml(b));
      m.on("click", ()=> renderForBranch(b.id));
      branchMarkers.set(b.id, m);
      latlngs.push([b.lat, b.lng]);
    }

    if(latlngs.length){
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds.pad(0.12));
    }else{
      map.setView([36.5, 127.9], 7);
    }
  }

  function goHome(){
    selectedBranchId = "";
    selectedSchool = null;

    branchSelect.value = "";
    nearBranchBox.classList.remove("show");
    nearBranchBox.innerHTML = "";

    pillBranch.textContent = "—";
    pillAddress.textContent = "—";

    circleLayer.clearLayers();
    focusLayer.clearLayers();
    cluster.clearLayers();

    markerBySchoolId.clear();
    currentWithinById.clear();

    clearResults();
    renderAllBranches();
  }


  function setRadiusButtons(){
    document.querySelectorAll(".seg-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        document.querySelectorAll(".seg-btn").forEach(b=>b.classList.remove("is-active"));
        btn.classList.add("is-active");
        radiusKm = Number(btn.dataset.radius || 3);
        if (selectedBranchId) renderForBranch(selectedBranchId);
      });
    });
  }

  function zoomForRadius(km){
    // 반경이 작을수록 더 확대
    if(km <= 1) return 15;
    if(km <= 3) return 14;
    return 13; // 5km
  }

  function setTypeTabs(){
    document.querySelectorAll(".tab").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        document.querySelectorAll(".tab").forEach(b=>b.classList.remove("is-active"));
        btn.classList.add("is-active");
        typeFilter = btn.dataset.type || "all";
        if (selectedBranchId) renderForBranch(selectedBranchId);
      });
    });
  }

  function clearResults(){
    resultBody.innerHTML = '<tr><td colspan="7" class="empty">지점을 선택하거나 학교를 검색하면 결과가 표시됩니다.</td></tr>';
    kpiCount.textContent = "—";
    kpiStudents.textContent = "—";
    kpiNearest.textContent = "—";
  }

  function popupHtml(s, km){
    const home = s.homepage ? `<a href="${s.homepage}" target="_blank" rel="noopener" class="btn-link">바로가기</a>` : `<span class="btn-link is-disabled">없음</span>`;
    return `
      <div style="font-family:Pretendard, system-ui; min-width:220px;">
        <div style="font-weight:800; margin-bottom:4px; color:#fff;">${escapeHtml(s.name)}</div>
        <div style="color:rgba(255,255,255,.75); font-size:12px; margin-bottom:8px;">
          ${escapeHtml(s.type)} · ${fmtKm(km)}
        </div>
        <div style="font-size:12px; margin-bottom:8px; line-height:1.35;">
          1학년 ${fmtInt(s.g1)} · 2학년 ${fmtInt(s.g2)} · 3학년 ${fmtInt(s.g3)}
        </div>
        <div style="font-size:12px; color:rgba(255,255,255,.75); margin-bottom:8px;">
          ${escapeHtml(s.address || "")}
        </div>
        ${home}
      </div>
    `;
  }

  function escapeHtml(str){
    return String(str||"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function renderForBranch(branchId){
    const b = branches.find(x=>x.id===branchId);
    if(!b){ return; }

    selectedBranchId = branchId;
    selectedSchool = null;
    nearBranchBox.classList.remove("show");
    nearBranchBox.innerHTML = "";

    pillBranch.textContent = b.name;
    pillAddress.textContent = b.address || "—";

    // map focus
    map.setView([b.lat, b.lng], zoomForRadius(radiusKm));

    circleLayer.clearLayers();
    focusLayer.clearLayers();
    cluster.clearLayers();

    markerBySchoolId.clear();
    currentWithinById.clear();

    // Branch marker
    const bm = L.marker([b.lat, b.lng], { icon: iconBranchSelected }).addTo(focusLayer);
    bm.bindPopup(branchPopupHtml(b));

    // Circle
    L.circle([b.lat, b.lng], {
      radius: radiusKm * 1000,
      color: "rgba(245,130,33,.65)",
      weight: 2,
      fillColor: "rgba(245,130,33,.15)",
      fillOpacity: 0.7
    }).addTo(circleLayer);

    const within = [];
    for(const s of schools){
      if(typeFilter !== "all" && s.type !== typeFilter) continue;
      const km = haversineKm(b.lat, b.lng, s.lat, s.lng);
      if(km <= radiusKm){
        within.push({ ...s, km });
      }
    }
    within.sort((a,c)=>a.km-c.km);

    // Markers (cluster) + allow list-click to highlight marker & open popup
    within.forEach(s=>{
      const m = L.marker([s.lat, s.lng], { icon: iconSchool(s.type) });
      m.bindPopup(popupHtml(s, s.km));

      // Keep references so clicking a row can control the marker & show info on map
      markerBySchoolId.set(s.id, m);
      currentWithinById.set(s.id, s);

      // If user clicks marker on the map, sync highlight in the list
      m.on("click", ()=>{
        selectSchool(s.id);
      });

      cluster.addLayer(m);
    });

    // KPIs
    kpiCount.textContent = fmtInt(within.length);
    const totalStudents = within.reduce((acc,s)=> acc + (s.g1||0) + (s.g2||0) + (s.g3||0), 0);
    kpiStudents.textContent = fmtInt(totalStudents);
    kpiNearest.textContent = within.length ? `${within[0].name} · ${fmtKm(within[0].km)}` : "—";

    // Table
    if(!within.length){
      resultBody.innerHTML = '<tr><td colspan="7" class="empty">선택한 조건에서 반경 내 학교가 없습니다.</td></tr>';
      return;
    }

    resultBody.innerHTML = "";
    within.forEach((s, idx)=>{
      const tr = document.createElement("tr");
      const badge = s.type === "고등학교"
        ? `<span class="badge hs"><span class="b-dot"></span>고등</span>`
        : `<span class="badge ms"><span class="b-dot"></span>중등</span>`;
      const homeBtn = s.homepage
        ? `<a class="btn-link" href="${s.homepage}" target="_blank" rel="noopener">열기</a>`
        : `<span class="btn-link is-disabled">없음</span>`;
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div style="font-weight:750;">${escapeHtml(s.name)}</div>
            ${badge}
          </div>
          <div style="margin-top:4px; color: rgba(244,246,255,.68); font-size:12px; line-height:1.35;">
            ${escapeHtml(s.address||"")}
          </div>
        </td>
        <td style="white-space:nowrap;">${fmtKm(s.km)}</td>
        <td>${fmtInt(s.g1||0)}</td>
        <td>${fmtInt(s.g2||0)}</td>
        <td>${fmtInt(s.g3||0)}</td>
        <td>${homeBtn}</td>
      `;
      tr.dataset.schoolId = s.id;
      tr.addEventListener("click", ()=>{
        selectSchool(s.id);
      });
      resultBody.appendChild(tr);
    });
  }

  // 학교 검색 -> 가까운 지점 보여주기
  
  function selectSchool(schoolId){
    const s = currentWithinById.get(schoolId);
    if(!s) return;

    // reset previous marker + row
    if(selectedSchool && markerBySchoolId.has(selectedSchool.id)){
      const prev = selectedSchool;
      const pm = markerBySchoolId.get(prev.id);
      pm.setIcon(iconSchool(prev.type));
    }
    // row highlight
    Array.from(resultBody.querySelectorAll("tr.is-selected")).forEach(r=>r.classList.remove("is-selected"));
    const row = resultBody.querySelector(`tr[data-school-id="${schoolId}"]`);
    if(row) row.classList.add("is-selected");

    selectedSchool = s;

    const m = markerBySchoolId.get(schoolId);
    if(!m) return;

    // make marker larger and show info on the map
    m.setIcon(iconSchoolSelected(s.type));

    cluster.zoomToShowLayer(m, ()=>{
      map.setView([s.lat, s.lng], Math.max(map.getZoom(), 14));
      m.openPopup();
    });
  }

function showSchoolSuggest(items){
    if(!items.length){
      schoolSuggest.classList.add("hidden");
      schoolSuggest.innerHTML = "";
      return;
    }
    schoolSuggest.classList.remove("hidden");
    schoolSuggest.innerHTML = "";
    items.slice(0,10).forEach(s=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `
        <div style="font-weight:700;">${escapeHtml(s.name)} <span style="color:rgba(244,246,255,.65); font-weight:600; font-size:12px;">(${escapeHtml(s.type)})</span></div>
        <div class="sub">${escapeHtml(s.address||"")}</div>
      `;
      btn.addEventListener("click", ()=>{
        schoolSuggest.classList.add("hidden");
        schoolSuggest.innerHTML = "";
        schoolSearch.value = s.name;
        selectedSchool = s;
        renderNearestBranchesFromSchool(s);
      });
      schoolSuggest.appendChild(btn);
    });
  }

  function renderNearestBranchesFromSchool(s){
    // focus map to school
    focusLayer.clearLayers();
    circleLayer.clearLayers();
    cluster.clearLayers();

    markerBySchoolId.clear();
    currentWithinById.clear();

    const sm = L.marker([s.lat, s.lng], { icon: iconSchool(s.type) }).addTo(focusLayer);
    sm.bindPopup(popupHtml(s, 0)).openPopup();
    map.setView([s.lat, s.lng], 13);

    // compute nearest branches
    const near = branches.map(b=>{
      const km = haversineKm(s.lat, s.lng, b.lat, b.lng);
      return { ...b, km };
    }).sort((a,c)=>a.km-c.km).slice(0,8);

    nearBranchBox.classList.add("show");
    nearBranchBox.innerHTML = `
      <div class="title">가까운 지점 (학교 기준)</div>
      <div class="list">
        ${near.map(b=>`
          <div class="item">
            <div>
              <div class="name">${escapeHtml(b.name)}</div>
              <div class="meta">${fmtKm(b.km)} · ${escapeHtml(b.address||"")}</div>
            </div>
            <button type="button" data-branch="${b.id}">이 지점 보기</button>
          </div>
        `).join("")}
      </div>
    `;
    nearBranchBox.querySelectorAll("button[data-branch]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-branch");
        branchSelect.value = id;
        renderForBranch(id);
      });
    });
  }

  // Event wiring
  branchSelect.addEventListener("change", ()=>{
    const id = branchSelect.value;
    if(!id){
      selectedBranchId = "";
      pillBranch.textContent = "지점을 선택해 주세요";
      pillAddress.textContent = "—";
      nearBranchBox.classList.remove("show");
      nearBranchBox.innerHTML = "";
      clearResults();
      map.setView([36.5, 127.9], 7);
      circleLayer.clearLayers(); focusLayer.clearLayers(); cluster.clearLayers();
      return;
    }
    renderForBranch(id);
  });

  schoolSearch.addEventListener("input", ()=>{
    const q = schoolSearch.value.trim().toLowerCase();
    if(q.length < 2){
      showSchoolSuggest([]);
      return;
    }
    const matches = schools.filter(s=> (s.name||"").toLowerCase().includes(q));
    showSchoolSuggest(matches);
  });

  document.addEventListener("click", (e)=>{
    if(!schoolSuggest.contains(e.target) && e.target !== schoolSearch){
      schoolSuggest.classList.add("hidden");
    }
  });


  const homeBtn = $("homeBtn");
  if(homeBtn){
    homeBtn.addEventListener("click", ()=>{
      goHome();
    });
  }
  populateBranches();
  setRadiusButtons();
  setTypeTabs();
  clearResults();
  renderAllBranches();

})();
