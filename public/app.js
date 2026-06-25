// 부업 계산기 프론트엔드
const won = (n) => '₩' + Math.round(n || 0).toLocaleString('ko-KR');
const num = (n) => Number(n || 0).toLocaleString('ko-KR');
const $ = (s, el = document) => el.querySelector(s);

let currentRange = 'month';

// ── 데이터 로드 & 렌더 ──
async function refresh() {
  const [summary, status] = await Promise.all([
    fetch(`/api/summary?range=${currentRange}`).then((r) => r.json()),
    fetch('/api/status').then((r) => r.json()),
  ]);
  renderSummary(summary);
  renderStatus(status);
}

function renderSummary(data) {
  $('#grandTotal').textContent = won(data.grandTotal);
  $('#adsenseTotal').textContent = won(data.providers.adsense.total);
  $('#adpostTotal').textContent = won(data.providers.adpost.total);

  // 알림 (수집 실패 등)
  const alerts = $('#alerts');
  alerts.innerHTML = '';
  for (const [prov, msg] of Object.entries(data.errors || {})) {
    const label = prov === 'adsense' ? '애드센스' : '애드포스트';
    const div = document.createElement('div');
    div.className = 'alert';
    div.textContent = `⚠️ ${label} 자동 수집 실패: ${msg}`;
    alerts.appendChild(div);
  }

  // 채널 카드
  const all = [...data.providers.adsense.channels, ...data.providers.adpost.channels]
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0));

  const wrap = $('#channels');
  wrap.innerHTML = '';
  $('#emptyHint').hidden = all.length > 0;

  for (const c of all) wrap.appendChild(channelCard(c));
}

function channelCard(c) {
  const el = document.createElement('div');
  el.className = 'channel-card';
  const tag = c.provider === 'adsense' ? 'adsense' : 'adpost';
  const tagText = c.provider === 'adsense' ? 'AdSense' : 'AdPost';
  const delBtn = c.manual
    ? `<button class="cc-del" data-del="${c.id}">삭제</button>` : '';

  el.innerHTML = `
    <div class="cc-head">
      <div class="cc-name"><span class="tag ${tag}">${tagText}</span>${escapeHtml(c.name)}</div>
      <div style="text-align:right">
        <div class="cc-revenue">${won(c.revenue)}</div>
        ${delBtn}
      </div>
    </div>
    <div class="cc-metrics">
      <div class="metric views"><div class="label">조회</div><div class="value">${num(c.views)}</div></div>
      <div class="metric visits"><div class="label">방문</div><div class="value">${num(c.visits)}</div></div>
      <div class="metric impressions"><div class="label">노출</div><div class="value">${num(c.impressions)}</div></div>
      <div class="metric ctr"><div class="label">CTR</div><div class="value">${(c.ctr || 0).toFixed(2)}%</div></div>
      <div class="metric stay"><div class="label">체류</div><div class="value">0:00</div></div>
    </div>`;

  const del = el.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => {
    await fetch(`/api/manual/${del.dataset.del}`, { method: 'DELETE' });
    refresh();
  });
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

// ── 연결 상태 ──
function renderStatus(status) {
  // 애드센스
  const a = $('#adsenseConn');
  if (!status.adsense.configured) {
    a.innerHTML = `<div class="status-line off">.env 에 GOOGLE_CLIENT_ID/SECRET 설정이 필요합니다.</div>`;
  } else if (status.adsense.connected) {
    a.innerHTML = `<div class="status-line"><span class="ok">● 연결됨</span>
      <button class="ghost-btn" id="adsenseOff">연결 해제</button></div>`;
    $('#adsenseOff').onclick = async () => {
      await fetch('/api/adsense/disconnect', { method: 'POST' }); refresh();
    };
  } else {
    a.innerHTML = `<a class="primary-btn" href="/auth/google">구글로 연결하기</a>`;
  }

  // 애드포스트
  const p = $('#adpostConn');
  if (status.adpost.connected) {
    p.innerHTML = `<div class="status-line"><span class="ok">● 쿠키 등록됨</span>
      <button class="ghost-btn" id="adpostOff">연결 해제</button></div>`;
    $('#adpostOff').onclick = async () => {
      await fetch('/api/adpost/disconnect', { method: 'POST' }); refresh();
    };
  } else {
    p.innerHTML = `
      <div class="cookie-row">
        <textarea id="adpostCookie" placeholder="NID_AUT=...; NID_SES=...; (네이버 쿠키 전체)"></textarea>
        <button class="primary-btn" id="adpostSave">쿠키 저장</button>
      </div>`;
    $('#adpostSave').onclick = async () => {
      const cookie = $('#adpostCookie').value.trim();
      if (!cookie) return;
      await fetch('/api/adpost/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie }),
      });
      refresh();
    };
  }
}

// ── 이벤트 바인딩 ──
$('#rangeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  [...e.currentTarget.children].forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentRange = btn.dataset.range;
  refresh();
});

// 모달 열고 닫기
const openModal = (id) => { $('#' + id).hidden = false; };
const closeModal = (el) => { el.hidden = true; };
$('#settingsBtn').onclick = () => openModal('settingsModal');
$('#addManualBtn').onclick = () => openModal('manualModal');
document.querySelectorAll('[data-close]').forEach((b) =>
  b.onclick = () => closeModal(b.closest('.modal')));
document.querySelectorAll('.modal').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));

$('#cookieHelp').onclick = (e) => {
  e.preventDefault();
  const box = $('#cookieHelpBox'); box.hidden = !box.hidden;
};

// 수동 입력 제출
$('#manualForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  await fetch('/api/manual', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fd),
  });
  e.target.reset();
  closeModal($('#manualModal'));
  refresh();
});

// URL 파라미터로 온 OAuth 결과 처리
const params = new URLSearchParams(location.search);
if (params.get('adsense')) {
  history.replaceState({}, '', '/');
}

refresh();
