// 네이버 애드포스트(AdPost) 연동 — 공식 API가 없어 best-effort 방식.
//
// 네이버는 애드포스트용 공개 API를 제공하지 않습니다. 그래서:
//   1) 사용자가 브라우저에서 애드포스트에 로그인한 뒤 쿠키를 복사해 등록
//   2) 그 쿠키로 애드포스트 리포트 엔드포인트를 호출해 수익을 가져옴
//
// 네이버가 엔드포인트/응답 형식을 바꾸면 .env 의 ADPOST_REPORT_URL 과
// normalize() 매핑만 조정하면 됩니다. 자동 수집이 실패하면 프론트엔드는
// 수동 입력으로 자연스럽게 폴백합니다.

import axios from 'axios';
import { load, update } from './store.js';

export function isConnected() {
  const s = load();
  return Boolean(s.adpost?.cookie);
}

export function saveCookie(cookie) {
  update((s) => { s.adpost.cookie = (cookie || '').trim() || null; });
}

export function disconnect() {
  update((s) => { s.adpost.cookie = null; });
}

const REPORT_URL = () =>
  process.env.ADPOST_REPORT_URL || 'https://adpost.naver.com/api/v3/report/total';

function dateRangeFor(range) {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const start = new Date(today);
  if (range === 'today' || range === 'yesterday') {
    if (range === 'yesterday') start.setDate(start.getDate() - 1);
    const day = range === 'yesterday' ? new Date(start) : today;
    return { from: fmt(start), to: fmt(day) };
  }
  if (range === 'last7') {
    start.setDate(start.getDate() - 6);
    return { from: fmt(start), to: fmt(today) };
  }
  // month-to-date
  start.setDate(1);
  return { from: fmt(start), to: fmt(today) };
}

// 애드포스트 응답을 우리 공통 형식으로 변환.
// 응답 키가 환경마다 다를 수 있어 여러 후보 키를 관대하게 처리합니다.
function normalize(data) {
  const pick = (obj, keys, dflt = 0) => {
    for (const k of keys) if (obj?.[k] != null) return obj[k];
    return dflt;
  };
  // 채널(미디어) 목록이 들어있을 법한 위치 탐색
  const list =
    data?.channels || data?.mediaList || data?.list || data?.items ||
    data?.result?.channels || data?.result?.list || [];

  const channels = (Array.isArray(list) ? list : []).map((row) => {
    const revenue = Math.round(Number(pick(row, ['revenue', 'income', 'amount', 'earning', 'pay'])));
    const views = Number(pick(row, ['view', 'views', 'pv', 'pageView']));
    const visits = Number(pick(row, ['visit', 'visits', 'uv']));
    const impressions = Number(pick(row, ['impression', 'impressions', 'noChul', 'exposure']));
    let ctr = Number(pick(row, ['ctr', 'clickRate']));
    if (ctr > 0 && ctr <= 1) ctr *= 100; // 비율로 온 경우 %로
    return {
      provider: 'adpost',
      name: pick(row, ['name', 'mediaName', 'channelName', 'title'], '(애드포스트 채널)'),
      revenue,
      views,
      visits,
      impressions,
      ctr,
    };
  });

  const total = channels.length
    ? channels.reduce((s, c) => s + c.revenue, 0)
    : Math.round(Number(pick(data, ['totalRevenue', 'total', 'sum', 'revenue'])));

  return { provider: 'adpost', total, channels };
}

export async function fetchEarnings(range = 'month') {
  const s = load();
  if (!s.adpost?.cookie) throw new Error('애드포스트가 연결되어 있지 않습니다. (네이버 쿠키 미등록)');

  const { from, to } = dateRangeFor(range);
  const res = await axios.get(REPORT_URL(), {
    params: { from, to, startDate: from, endDate: to },
    headers: {
      Cookie: s.adpost.cookie,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Referer: 'https://adpost.naver.com/',
      Accept: 'application/json',
    },
    timeout: 15000,
    // 로그인 만료 시 네이버가 로그인 페이지(HTML)로 리다이렉트하므로 그것도 잡아냄
    validateStatus: () => true,
  });

  const ct = String(res.headers['content-type'] || '');
  if (res.status === 401 || res.status === 403 || (ct.includes('text/html'))) {
    throw new Error('애드포스트 인증 만료/실패. 네이버에 다시 로그인 후 쿠키를 갱신해주세요.');
  }
  if (res.status >= 400) {
    throw new Error(`애드포스트 응답 오류 (HTTP ${res.status}).`);
  }
  return normalize(res.data);
}
