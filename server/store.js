// 아주 단순한 파일 기반 저장소.
// 토큰/쿠키/수동입력값을 server/data/store.json 에 보관합니다.
// (민감정보가 들어가므로 .gitignore 로 커밋에서 제외됨)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const FILE = join(DATA_DIR, 'store.json');

const DEFAULTS = {
  adsense: { tokens: null, accountName: null },
  adpost: { cookie: null },
  // 채널별 수동 입력값 { provider: 'adpost'|'adsense', name, revenue, views, visits, impressions, ctr }
  manual: [],
};

function ensure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) writeFileSync(FILE, JSON.stringify(DEFAULTS, null, 2));
}

export function load() {
  ensure();
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(patch) {
  const cur = load();
  const next = { ...cur, ...patch };
  ensure();
  writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

export function update(mutator) {
  const cur = load();
  mutator(cur);
  ensure();
  writeFileSync(FILE, JSON.stringify(cur, null, 2));
  return cur;
}
