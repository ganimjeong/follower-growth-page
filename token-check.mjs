#!/usr/bin/env node
// 토큰이 살아 있는지 매일 확인하고, 만료가 가까우면 연장한다.
//
// 왜 필요한가:
//   토큰이 죽으면 수집이 멈추는데, 화면에는 '점이 안 늘어난다'로만 보인다. 아무도
//   눈치채지 못한 채 몇 주가 지나가는 게 이 종류 연동의 흔한 최후다. 매일 확인해서
//   죽었으면 Actions를 빨갛게 만들고, 죽기 전이면 알아서 연장한다.
//
// 토큰 종류에 따라 할 일이 다르다:
//   - 페이지 토큰: 만료 시각이 없다(expires_at = 0). 확인만 하고 지나간다.
//   - 사용자 토큰: 60일. 만료 14일 전부터 fb_exchange_token으로 연장하고,
//     워크플로가 새 값을 시크릿에 다시 넣는다.
//
// 토큰 값은 절대 출력하지 않는다 — Actions 로그는 저장소를 볼 수 있는 사람이 다 본다.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const GRAPH = 'https://graph.facebook.com/v21.0';
const RENEW_WITHIN_DAYS = 14;
const DAY = 86400;

const path = new URL('./channels.json', import.meta.url);
const creds = JSON.parse(readFileSync(path));
const self = creds.self;
if (!self?.accessToken) throw new Error('channels.json에 self.accessToken이 없다');

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function get(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
  return j;
}

// appId/appSecret이 없으면 검사도 연장도 못 한다. 막지는 않되 그 사실을 남긴다
if (!self.appId || !self.appSecret) {
  console.log('appId/appSecret이 없어 토큰 점검을 건너뛴다 (연장이 필요해지면 수동)');
  out('rotated', 'false');
  process.exit(0);
}

const appToken = `${self.appId}|${self.appSecret}`;
const info = (
  await get(`${GRAPH}/debug_token?input_token=${self.accessToken}&access_token=${appToken}`)
).data;

if (!info?.is_valid) {
  console.error(`토큰이 무효하다: ${info?.error?.message ?? '알 수 없는 사유'}`);
  console.error('README의 "토큰 다시 받기"를 따라 재발급하고 CHANNELS_JSON 시크릿을 갱신할 것');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);

// 데이터 접근 만료(90일)는 연장 대상이 아니다 — 사람이 다시 승인해야 한다.
// 조용히 끊기기 전에 미리 알려주는 게 이 경고의 전부다
if (info.data_access_expires_at && info.data_access_expires_at > 0) {
  const left = Math.round((info.data_access_expires_at - now) / DAY);
  if (left <= 21) console.log(`⚠ 데이터 접근 권한이 ${left}일 뒤 만료된다 — 재승인이 필요하다`);
}

if (!info.expires_at || info.expires_at === 0) {
  console.log('토큰 만료 없음(페이지 토큰) — 연장할 것이 없다');
  out('rotated', 'false');
  process.exit(0);
}

const daysLeft = Math.round((info.expires_at - now) / DAY);
console.log(`토큰 만료까지 ${daysLeft}일`);
if (daysLeft > RENEW_WITHIN_DAYS) {
  out('rotated', 'false');
  process.exit(0);
}

console.log('만료가 가까워 연장한다');
const renewed = await get(
  `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${self.appId}&client_secret=${self.appSecret}&fb_exchange_token=${self.accessToken}`
);
if (!renewed.access_token) throw new Error('연장 응답에 access_token이 없다');

creds.self.accessToken = renewed.access_token;
writeFileSync(path, JSON.stringify(creds, null, 2) + '\n');
console.log('연장 완료 — 시크릿에 다시 저장한다');
out('rotated', 'true');
