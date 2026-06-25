// 부업 수익 — 핸드폰 전용 단순 버전 (얼마 벌었는지 중심)
const won = (n) => '₩' + Math.round(n || 0).toLocaleString('ko-KR');
const cnt = (n) => Number(n || 0).toLocaleString('ko-KR');
const $ = (s, el = document) => el.querySelector(s);

const RANGE_LABEL = { today: '오늘 번 돈', yesterday: '어제 번 돈', last7: '최근 7일 번 돈', month: '이번 달 번 돈' };
let currentRange = 'month';

async function refresh() {
  const [summary, status] = await Promise.all([
    fetch(`/api/summary?range=${currentRange}`).then((r) => r.json()),
    fetch('/api/status').then((r) => r.json()),
  ]);
  renderSummary(summary);
  renderStatus(status);
}

function renderSummary(data) {
  $('#heroLabel').textContent = RANGE_LABEL[currentRange] || '번 돈';
  $('#grandTotal').textContent = won(data.grandTotal);
  $('#adsenseTotal').textContent = won(data.providers.adsense.total);
  $('#adpostTotal').textContent = won(data.providers.adpost.total);

  const alerts = $('#alerts');
  alerts.innerHTML = '';
  for (const [prov, msg] of Object.entries(data.errors || {})) {
    const label = prov === 'adsense' ? '애드센스' : '애드포스트';
    const div = document.createElement('div');
    div.className = 'alert';
    div.textContent = `⚠️ ${label} 자동 수집 실패: ${msg}`;
    alerts.appendChild(div);
  }

  const all = [...data.providers.adsense.channels, ...data.providers.adpost.channels]
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0));

  const wrap = $('#channels');
  wrap.innerHTML = '';
  $('#emptyHint').hidden = all.length > 0;
  for (const c of all) wrap.appendChild(channelRow(c));
}

function channelRow(c) {
  const el = document.createElement('div');
  el.className = 'channel-card';
  const tag = c.provider === 'adsense' ? 'adsense' : 'adpost';
  const tagText = c.provider === 'adsense' ? 'AdSense' : 'AdPost';
  const del = c.manual ? `<button class="cr-del" data-del="${c.id}" title="삭제">✕</button>` : '';
  el.innerHTML = `
    <div class="cr-head">
      <div class="cr-left">
        <span class="cr-tag ${tag}">${tagText}</span>
        <span class="cr-name">${escapeHtml(c.name)}</span>
      </div>
      <div class="cr-right">
        <span class="cr-amt">${won(c.revenue)}</span>${del}
      </div>
    </div>
    <div class="cr-metrics">
      <div class="metric views"><div class="label">조회</div><div class="value">${cnt(c.views)}</div></div>
      <div class="metric visits"><div class="label">방문</div><div class="value">${cnt(c.visits)}</div></div>
      <div class="metric impressions"><div class="label">노출</div><div class="value">${cnt(c.impressions)}</div></div>
    </div>`;
  const delBtn = el.querySelector('[data-del]');
  if (delBtn) delBtn.addEventListener('click', async () => {
    await fetch(`/api/manual/${delBtn.dataset.del}`, { method: 'DELETE' });
    refresh();
  });
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function renderStatus(status) {
  const a = $('#adsenseConn');
  if (!status.adsense.configured) {
    a.innerHTML = `<div class="status-line" style="color:var(--muted)">.env 에 GOOGLE_CLIENT_ID/SECRET 설정이 필요합니다.</div>`;
  } else if (status.adsense.connected) {
    a.innerHTML = `<div class="status-line"><span class="ok">● 연결됨</span>
      <button class="ghost-btn" id="adsenseOff">연결 해제</button></div>`;
    $('#adsenseOff').onclick = async () => { await fetch('/api/adsense/disconnect', { method: 'POST' }); refresh(); };
  } else {
    a.innerHTML = `<a class="primary-btn" href="/auth/google">구글로 연결하기</a>`;
  }

  const p = $('#adpostConn');
  if (status.adpost.connected) {
    p.innerHTML = `<div class="status-line"><span class="ok">● 쿠키 등록됨</span>
      <button class="ghost-btn" id="adpostOff">연결 해제</button></div>`;
    $('#adpostOff').onclick = async () => { await fetch('/api/adpost/disconnect', { method: 'POST' }); refresh(); };
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

// 기간 탭
$('#rangeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  [...e.currentTarget.children].forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentRange = btn.dataset.range;
  refresh();
});

// 모달
const openModal = (id) => { $('#' + id).hidden = false; };
const closeModal = (el) => { el.hidden = true; };
$('#settingsBtn').onclick = () => openModal('settingsModal');
$('#addManualBtn').onclick = () => openModal('manualModal');
document.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => closeModal(b.closest('.modal')));
document.querySelectorAll('.modal').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));
$('#cookieHelp').onclick = (e) => { e.preventDefault(); const box = $('#cookieHelpBox'); box.hidden = !box.hidden; };

// 광고 종류 세그먼트
$('#provSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  [...e.currentTarget.children].forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  $('input[name="provider"]').value = btn.dataset.prov;
});

// 수익 추가
$('#manualForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  await fetch('/api/manual', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fd),
  });
  e.target.reset();
  $('input[name="provider"]').value = 'adpost';
  [...$('#provSeg').children].forEach((b, i) => b.classList.toggle('active', i === 0));
  closeModal($('#manualModal'));
  refresh();
});

// OAuth 결과 정리
if (new URLSearchParams(location.search).get('adsense')) history.replaceState({}, '', '/');

// PWA 서비스워커
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

refresh();
