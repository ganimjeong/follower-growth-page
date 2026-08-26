# 채널 팔로워 성장세 (수집 중지 — 기록 보관용)

> ## ⚠️ 자동 수집은 멈췄습니다
>
> 팔로워 수집은 **wayclip-booking 사이트가 직접** 합니다. 인스타 Graph API의
> Business Discovery를 Cloudflare cron이 부르고, 결과는 그쪽 D1에 쌓이며, 화면은
> 관리자 페이지의 **채널** 탭입니다(마케팅전략팀 · fnb마케팅팀 각각).
>
> 여기서 계속 돌리면 같은 계정을 두 곳에서 긁게 되고, 두 숫자가 어긋났을 때 어느 쪽이
> 맞는지 아무도 모릅니다. 그래서 `schedule`을 뗐습니다(수동 실행 버튼만 남음).
>
> **`data.json` / `fnb.json` 은 지우지 마세요.** 2026-05-27부터의 실측이 담겨 있고,
> 사이트의 `0030_seed_channels.sql` 이 이 값을 옮겨간 원본입니다.

이 저장소는 이제 **과거 기록 보관소**이자, 사이트 쪽이 오래 막혔을 때의 임시 수단입니다.

- 공개 페이지(양산형 채널 5개) 👉 https://ganimjeong.github.io/follower-growth-page/
- 사내 화면은 wayclip-booking 관리자 페이지 → 채널 탭

## 파일

| 파일 | 무엇 | 누가 읽나 |
|---|---|---|
| `data.json` | 양산형 채널 (`team: strategy`) | 공개 페이지 + 관리자 화면 |
| `fnb.json` | FNB 매장 채널 (`team: fnb`) | 관리자 화면만 |
| `collect.mjs` | 수집 스크립트 | GitHub Actions |
| `token-check.mjs` | 토큰 점검·연장 | GitHub Actions |

`points[].counts`는 `channels`와 **같은 순서·같은 길이**입니다. `null`은 "그날 수집하지
않았다"는 뜻이고 0이 아닙니다 — 0으로 적으면 그래프가 절벽처럼 떨어져 채널이 망한
것처럼 보입니다.

## 수집 방식 — Business Discovery

우리가 가진 **인스타 프로 계정 하나**의 토큰으로, 대상 계정을 **핸들만 알면** 조회합니다.

```
GET graph.facebook.com/v21.0/{우리_IG_USER_ID}
      ?fields=business_discovery.username(대상핸들){followers_count}
      &access_token={토큰}
```

대상 계정에는 **아무 권한도 필요 없습니다.** 공개 프로페셔널(비즈니스/크리에이터)
계정이기만 하면 됩니다. 대상이 우리 계정 센터에 없어도, 페이스북 페이지가 연결돼
있지 않아도 상관없습니다 — 그래서 계정마다 로그인·승인을 받는 방식 대신 이걸 씁니다.
관리할 토큰이 채널 수만큼이 아니라 **하나**입니다.

대상 계정이 **비공개이거나 개인 계정이면 조회되지 않습니다.** 그 채널만 그날 `null`로
남고 실행은 실패로 끝납니다(빨간 X).

## 처음 한 번: 토큰 만들기

우리 쪽 계정 하나만 세우면 됩니다. 수집 대상 채널들은 건드리지 않습니다.

1. **인스타 프로 계정 1개**를 준비합니다. 아무 계정이나 됩니다 — 새로 만들어도 되고,
   회사 대표 계정이어도 됩니다. 설정에서 **프로페셔널(비즈니스/크리에이터)** 로 전환합니다.
2. **페이스북 페이지 1개**를 만들고, 위 인스타 계정과 연결합니다.
   (인스타 앱 → 설정 → 계정 유형 및 도구 → 페이지 연결)
   ※ 이 페이지는 우리 것이면 됩니다. 수집 대상 채널들과는 무관합니다.
3. https://developers.facebook.com → **앱 만들기** → 유형 **비즈니스**
4. 앱에 **Instagram Graph API** 제품을 추가합니다.
5. **그래프 API 탐색기**(Graph API Explorer)에서
   - 앱 선택 → **사용자 토큰** 생성
   - 권한: `instagram_basic`, `pages_show_list`, `pages_read_engagement`
   - 토큰 생성 → 단기 토큰이 나옵니다
6. **장기 토큰으로 교환**합니다:
   ```bash
   curl "https://graph.facebook.com/v21.0/oauth/access_token\
   ?grant_type=fb_exchange_token&client_id=<앱ID>&client_secret=<앱시크릿>\
   &fb_exchange_token=<단기토큰>"
   ```
7. **페이지 토큰을 받습니다** (권장 — 페이지 토큰은 만료 시각이 없습니다):
   ```bash
   curl "https://graph.facebook.com/v21.0/me/accounts?access_token=<장기사용자토큰>"
   ```
   응답의 `data[].access_token`이 페이지 토큰입니다.
8. **우리 IG_USER_ID**를 확인합니다:
   ```bash
   curl "https://graph.facebook.com/v21.0/me/accounts\
   ?fields=instagram_business_account&access_token=<페이지토큰>"
   ```
   `instagram_business_account.id`가 그 값입니다.
9. **동작 확인** — 이게 되면 끝입니다:
   ```bash
   curl "https://graph.facebook.com/v21.0/<IG_USER_ID>\
   ?fields=business_discovery.username(gwangju__gomgom){followers_count}\
   &access_token=<페이지토큰>"
   ```

### 시크릿 등록

저장소 → Settings → Secrets and variables → Actions → `CHANNELS_JSON`:

```json
{
  "self": {
    "igUserId": "17841400000000000",
    "accessToken": "EAA...",
    "appId": "1234567890",
    "appSecret": "abcdef..."
  }
}
```

`appId`/`appSecret`은 토큰 점검·연장에만 쓰입니다. 없으면 점검을 건너뜁니다.

## 토큰 수명

- **페이지 토큰** — 만료 시각이 없습니다. `token-check.mjs`가 매일 살아 있는지만 확인합니다.
- **사용자 토큰** — 60일. 만료 14일 전부터 자동 연장하고, 새 값을 `CHANNELS_JSON`
  시크릿에 다시 씁니다. 이 자동 저장에는 시크릿 쓰기 권한을 가진 `GH_PAT` 시크릿이
  따로 필요합니다(페이지 토큰을 쓰면 필요 없습니다).
- **데이터 접근 권한**은 90일마다 재승인이 필요합니다. 21일 남으면 로그에 경고가 뜹니다.

토큰이 죽으면 수집이 멈추는데 화면에는 "점이 안 늘어난다"로만 보입니다. 그래서 매일
점검해서 죽었으면 Actions를 **실패**로 끝냅니다 — 조용히 넘어가지 않게 하려는 것입니다.

## 채널 추가하기

1. 해당 팀의 JSON(`data.json` 또는 `fnb.json`)의 `channels`에 한 줄 추가:
   ```json
   { "handle": "새핸들", "ko": "표시이름", "color": "#2563eb" }
   ```
2. 끝입니다. 관리자 화면은 새 핸들을 보면 **알아서 등록**합니다.
   과거 `points`의 `counts`가 짧아도 "그날은 모른다"로 처리되므로, 새 채널은 추가한
   날부터 선이 시작됩니다.

대상 계정이 **공개 프로페셔널 계정**인지만 확인하세요.

## 수동 실행

Actions 탭 → **Collect followers** → Run workflow.
