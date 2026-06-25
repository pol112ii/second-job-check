// 구글 애드센스(AdSense) 연동 — 공식 AdSense Management API v2 사용.
//
// 흐름:
//   1) getAuthUrl()           → 사용자를 구글 동의 화면으로 보냄
//   2) exchangeCode(code)     → 콜백에서 받은 code 를 토큰으로 교환 후 저장
//   3) fetchEarnings(range)   → 저장된 토큰으로 수익 리포트 조회
//
// 토큰은 store.js 에 보관하며 refresh_token 으로 자동 갱신됩니다.

import { google } from 'googleapis';
import { load, update } from './store.js';

const SCOPES = ['https://www.googleapis.com/auth/adsense.readonly'];

function oauthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('애드센스 설정 누락: .env 의 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 를 채워주세요.');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isConnected() {
  const s = load();
  return Boolean(s.adsense?.tokens);
}

export function getAuthUrl() {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // refresh_token 을 확실히 받기 위함
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  update((s) => {
    // 기존 refresh_token 유지 (재동의 시 누락될 수 있어서)
    const prev = s.adsense?.tokens || {};
    s.adsense.tokens = { ...prev, ...tokens };
  });
  return tokens;
}

export function disconnect() {
  update((s) => {
    s.adsense = { tokens: null, accountName: null };
  });
}

async function authedClient() {
  const s = load();
  if (!s.adsense?.tokens) throw new Error('애드센스가 연결되어 있지 않습니다.');
  const client = oauthClient();
  client.setCredentials(s.adsense.tokens);
  // 토큰이 갱신되면 저장
  client.on('tokens', (t) => {
    update((st) => {
      st.adsense.tokens = { ...st.adsense.tokens, ...t };
    });
  });
  return client;
}

async function resolveAccount(adsense) {
  const s = load();
  if (s.adsense?.accountName) return s.adsense.accountName;
  const res = await adsense.accounts.list();
  const acct = res.data.accounts?.[0];
  if (!acct) throw new Error('애드센스 계정을 찾을 수 없습니다.');
  update((st) => { st.adsense.accountName = acct.name; });
  return acct.name;
}

// range: 'today' | 'yesterday' | 'month' | 'last7'  (서버에서 날짜로 변환)
function dateRangeFor(range) {
  switch (range) {
    case 'today': return { reportingDateRange: 'TODAY' };
    case 'yesterday': return { reportingDateRange: 'YESTERDAY' };
    case 'last7': return { reportingDateRange: 'LAST_7_DAYS' };
    case 'month':
    default: return { reportingDateRange: 'MONTH_TO_DATE' };
  }
}

/**
 * 채널(사이트)별 수익을 가져옵니다. 애드포스트 화면과 맞추기 위해
 * 도메인(사이트) 차원으로 집계하고 수익/노출/클릭/CTR 을 반환합니다.
 */
export async function fetchEarnings(range = 'month') {
  const client = await authedClient();
  const adsense = google.adsense({ version: 'v2', auth: client });
  const account = await resolveAccount(adsense);

  const res = await adsense.accounts.reports.generate({
    account,
    ...dateRangeFor(range),
    metrics: ['ESTIMATED_EARNINGS', 'PAGE_VIEWS', 'IMPRESSIONS', 'CLICKS', 'IMPRESSIONS_CTR'],
    dimensions: ['DOMAIN_NAME'],
    currencyCode: 'KRW',
    orderBy: ['-ESTIMATED_EARNINGS'],
  });

  const headers = (res.data.headers || []).map((h) => h.name);
  const rows = res.data.rows || [];

  const channels = rows.map((row) => {
    const cells = row.cells.map((c) => c.value);
    const get = (name) => cells[headers.indexOf(name)];
    const revenue = Math.round(Number(get('ESTIMATED_EARNINGS') || 0));
    return {
      provider: 'adsense',
      name: get('DOMAIN_NAME') || '(애드센스)',
      revenue,
      views: Number(get('PAGE_VIEWS') || 0),
      impressions: Number(get('IMPRESSIONS') || 0),
      clicks: Number(get('CLICKS') || 0),
      ctr: Number(get('IMPRESSIONS_CTR') || 0) * 100, // 0~1 → %
    };
  });

  const total = channels.reduce((sum, c) => sum + c.revenue, 0);
  return { provider: 'adsense', total, channels };
}
