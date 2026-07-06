#!/usr/bin/env node
// 5개 채널의 현재 팔로워 수를 Instagram Graph API로 조회해 data.json에 오늘 1점 추가.
// 토큰은 channels.json(igUserId, igAccessToken)에서 읽음. 같은 날짜 점은 덮어씀.
import { readFileSync, writeFileSync } from 'node:fs';

const channels = JSON.parse(readFileSync(new URL('./channels.json', import.meta.url)));
const data = JSON.parse(readFileSync(new URL('./data.json', import.meta.url)));

// 오늘 날짜(KST, UTC+9)
const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function followers(id, token) {
  const url = `https://graph.facebook.com/v21.0/${id}?fields=followers_count&access_token=${token}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
  if (typeof j.followers_count !== 'number') throw new Error('followers_count 없음: ' + JSON.stringify(j));
  return j.followers_count;
}

const counts = [];
for (const ch of data.channels) {
  // 판매된 채널은 더 이상 수집하지 않고 null 기록 → 차트 선이 마지막 실측에서 끊김
  if (ch.sold) {
    console.log(`${ch.handle.padEnd(16)} ${'(판매됨 · 수집 생략)'.padStart(8)}`);
    counts.push(null);
    continue;
  }
  const info = channels[ch.handle];
  if (!info) throw new Error(`channels.json에 ${ch.handle} 없음`);
  const c = await followers(info.igUserId, info.igAccessToken);
  console.log(`${ch.handle.padEnd(16)} ${String(c).padStart(8)}  (${Math.floor(c / 1000) / 10}만명)`);
  counts.push(c);
}

// 같은 날짜가 이미 있으면 교체, 없으면 추가
const idx = data.points.findIndex(p => p.date === kstDate);
const point = { date: kstDate, counts };
if (idx >= 0) { data.points[idx] = point; console.log(`\n${kstDate} 기존 점 갱신`); }
else { data.points.push(point); console.log(`\n${kstDate} 새 점 추가`); }

// 날짜순 정렬 보장
data.points.sort((a, b) => a.date.localeCompare(b.date));

writeFileSync(new URL('./data.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log('data.json 업데이트 완료');
