// 부업 계산기 — Express 서버
// 애드센스(자동 API) + 애드포스트(쿠키 기반) 수익을 모아서 한 화면에 제공.

import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as adsense from './adsense.js';
import * as adpost from './adpost.js';
import { load, update } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// 비동기 핸들러 에러 래퍼
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message || '서버 오류' });
});

// ── 연결 상태 ──
app.get('/api/status', (req, res) => {
  res.json({
    adsense: { configured: adsense.isConfigured(), connected: adsense.isConnected() },
    adpost: { connected: adpost.isConnected() },
  });
});

// ── 애드센스 OAuth ──
app.get('/auth/google', wrap(async (req, res) => {
  res.redirect(adsense.getAuthUrl());
}));

app.get('/auth/google/callback', wrap(async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/?adsense=error');
  await adsense.exchangeCode(code);
  res.redirect('/?adsense=connected');
}));

app.post('/api/adsense/disconnect', (req, res) => {
  adsense.disconnect();
  res.json({ ok: true });
});

// ── 애드포스트 쿠키 등록 ──
app.post('/api/adpost/connect', (req, res) => {
  const { cookie } = req.body || {};
  if (!cookie) return res.status(400).json({ error: '쿠키 값이 필요합니다.' });
  adpost.saveCookie(cookie);
  res.json({ ok: true });
});

app.post('/api/adpost/disconnect', (req, res) => {
  adpost.disconnect();
  res.json({ ok: true });
});

// ── 수동 입력 (자동 수집 실패/미연동 폴백) ──
app.get('/api/manual', (req, res) => {
  res.json({ manual: load().manual || [] });
});

app.post('/api/manual', (req, res) => {
  const { provider, name, revenue, views, visits, impressions, ctr } = req.body || {};
  if (!provider || revenue == null) {
    return res.status(400).json({ error: 'provider 와 revenue 는 필수입니다.' });
  }
  const entry = {
    id: Date.now().toString(36),
    provider,
    name: name || (provider === 'adpost' ? '애드포스트 (수동)' : '애드센스 (수동)'),
    revenue: Math.round(Number(revenue) || 0),
    views: Number(views) || 0,
    visits: Number(visits) || 0,
    impressions: Number(impressions) || 0,
    ctr: Number(ctr) || 0,
    manual: true,
  };
  update((s) => { s.manual = [...(s.manual || []), entry]; });
  res.json({ ok: true, entry });
});

app.delete('/api/manual/:id', (req, res) => {
  update((s) => { s.manual = (s.manual || []).filter((m) => m.id !== req.params.id); });
  res.json({ ok: true });
});

// ── 통합 요약: 두 광고 수익을 한 번에 ──
app.get('/api/summary', wrap(async (req, res) => {
  const range = req.query.range || 'month';
  const sources = [];
  const errors = {};

  // 애드센스 자동 수집
  if (adsense.isConnected()) {
    try {
      sources.push(await adsense.fetchEarnings(range));
    } catch (e) {
      errors.adsense = e.message;
    }
  }

  // 애드포스트 자동 수집
  if (adpost.isConnected()) {
    try {
      sources.push(await adpost.fetchEarnings(range));
    } catch (e) {
      errors.adpost = e.message;
    }
  }

  // 수동 입력 합치기
  const manual = load().manual || [];
  const manualByProvider = { adsense: [], adpost: [] };
  for (const m of manual) (manualByProvider[m.provider] || (manualByProvider[m.provider] = [])).push(m);

  const buildProvider = (provider) => {
    const auto = sources.find((s) => s.provider === provider);
    const man = manualByProvider[provider] || [];
    const channels = [...(auto?.channels || []), ...man];
    const total = channels.reduce((s, c) => s + (c.revenue || 0), 0);
    return { provider, total, channels, error: errors[provider] || null };
  };

  const adsenseData = buildProvider('adsense');
  const adpostData = buildProvider('adpost');
  const grandTotal = adsenseData.total + adpostData.total;

  res.json({
    range,
    grandTotal,
    providers: { adsense: adsenseData, adpost: adpostData },
    errors,
  });
}));

app.listen(PORT, () => {
  console.log(`✅ 부업 계산기 실행 중 → http://localhost:${PORT}`);
});
