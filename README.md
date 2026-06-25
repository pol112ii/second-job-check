# 부업 계산기 · 광고 수익 통합 (애드센스 + 애드포스트)

구글 **애드센스(AdSense)** 와 네이버 **애드포스트(AdPost)** 광고 수익을
한 화면에서 합산해서 보여주는 웹앱입니다. 업로드해주신 애드포스트 화면처럼
채널별 카드(조회/방문/노출/CTR/체류 + 수익금)로 보여주고, 맨 위에 **합계 수익**을 표시합니다.

![구조](https://img.shields.io/badge/stack-Node%20%2B%20Express%20%2B%20Vanilla%20JS-4ade80)

## 어떻게 수익을 모으나요?

| 광고 | 수집 방식 | 비고 |
| --- | --- | --- |
| 애드센스 | **공식 AdSense Management API (자동)** | 구글 OAuth 연결 후 자동 수집 |
| 애드포스트 | **로그인 쿠키 기반 (best-effort)** | 네이버 공식 API가 없어 쿠키로 수집, 실패 시 수동 입력 |
| (공통) | **직접 입력** | 자동 수집이 안 될 때 숫자만 넣어도 합산됨 |

> ⚠️ **현실적인 한계**: 네이버는 애드포스트용 공개 API를 제공하지 않습니다.
> 그래서 애드포스트는 사용자가 로그인한 쿠키로 비공식 수집을 시도하며,
> 네이버가 화면/엔드포인트를 바꾸면 동작이 멈출 수 있습니다.
> 이 경우 **‘수익 직접 입력’** 으로 안정적으로 사용할 수 있도록 설계했습니다.

## 빠른 시작

```bash
npm install
cp .env.example .env   # 값 채우기 (아래 참고)
npm start              # http://localhost:3000
```

`.env` 없이 실행해도 서버는 뜨고, **직접 입력** 기능은 바로 쓸 수 있습니다.
자동 수집을 쓰려면 아래 설정을 채우세요.

## 핸드폰 홈 화면에 설치 (PWA)

핸드폰 전용으로 만들어졌고 앱처럼 설치할 수 있습니다.

- **아이폰(사파리)**: 공유 버튼 → ‘홈 화면에 추가’
- **안드로이드(크롬)**: 메뉴(⋮) → ‘홈 화면에 추가 / 앱 설치’

설치하면 주소창 없이 전체 화면으로 뜨고, 큰 숫자로 **얼마 벌었는지** 바로 보입니다.

## 애드센스 연결 (자동 수집)

1. [Google Cloud Console](https://console.cloud.google.com) 에서 프로젝트 생성
2. **AdSense Management API** 사용 설정
3. **OAuth 2.0 클라이언트 ID**(웹 애플리케이션) 발급
   - 승인된 리디렉션 URI: `http://localhost:3000/auth/google/callback`
4. 발급받은 값을 `.env` 에 입력:
   ```env
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```
5. 앱 실행 후 ⚙️ → **구글로 연결하기** 클릭

## 애드포스트 연결 (쿠키)

1. PC 크롬에서 `adpost.naver.com` 로그인
2. `F12` → **Application → Cookies → naver.com**
3. 쿠키 문자열 전체를 복사
4. 앱 ⚙️ → 애드포스트 칸에 붙여넣고 **쿠키 저장**

> 쿠키는 로컬 서버(`server/data/store.json`)에만 저장되며 외부로 전송되지 않습니다.
> 네이버 응답 형식이 다르면 `server/adpost.js` 의 `normalize()` 매핑과
> `.env` 의 `ADPOST_REPORT_URL` 만 조정하면 됩니다.

## 프로젝트 구조

```
server/
  index.js     Express 서버 · API 라우트 · 통합 요약(/api/summary)
  adsense.js   애드센스 OAuth + Management API
  adpost.js    애드포스트 쿠키 기반 수집 (+ 유연한 필드 매핑)
  store.js     토큰/쿠키/수동입력 파일 저장소
public/
  index.html   대시보드 + 설정/입력 모달
  styles.css   다크 카드 UI (업로드 화면 스타일)
  app.js       렌더링 · 기간 탭 · 연결/입력 처리
```

## API 요약

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/summary?range=today\|yesterday\|last7\|month` | 두 광고 + 수동입력 통합 결과 |
| GET | `/api/status` | 연결 상태 |
| GET | `/auth/google` | 애드센스 OAuth 시작 |
| POST | `/api/adpost/connect` | 애드포스트 쿠키 등록 |
| GET/POST/DELETE | `/api/manual` | 수동 수익 입력/삭제 |

## 라이선스

MIT
