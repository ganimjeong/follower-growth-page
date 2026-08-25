#!/usr/bin/env node
// 팔로워 수를 조회해 피드 파일에 오늘 1점씩 추가한다. 같은 날짜 점은 덮어쓴다.
//
//   node collect.mjs data.json fnb.json
//
// 피드를 팀별로 나눈 이유: data.json은 공개 페이지(index.html)가 그리는 양산형 채널이고,
// fnb.json은 사내 관리자 화면만 보는 매장 채널이다. 한 파일에 섞으면 공개 페이지에
// 매장 계정이 딸려 올라간다 — counts 배열이 channels와 인덱스로 묶여 있어서 한쪽만
// 골라내기도 까다롭다.
//
// 방식: Business Discovery.
//   우리가 가진 인스타 프로 계정 하나의 토큰으로, 대상 계정을 '핸들'만 알면 조회한다.
//   대상 계정에는 아무 권한도 필요 없다 — 공개 프로페셔널 계정이기만 하면 된다.
//
// 왜 계정마다 토큰을 받지 않는가:
//   채널들이 우리 계정 센터에 묶여 있지 않고 페이스북 페이지도 연결돼 있지 않다.
//   계정마다 로그인·승인을 받으면 토큰이 채널 수만큼 생기고 그만큼을 살려둬야 한다.
//   Business Discovery는 우리 계정 하나만 세워두면 되므로 관리할 것이 하나다.
//
// 자격증명은 channels.json에서 읽는다(워크플로가 시크릿에서 써 준다):
//   { "self": { "igUserId": "1784...", "accessToken": "EAA...", "appId": "...", "appSecret": "..." } }
import { readFileSync, writeFileSync } from 'node:fs';

const GRAPH = 'https://graph.facebook.com/v21.0';

const files = process.argv.slice(2);
if (files.length === 0) files.push('data.json');

const creds = JSON.parse(readFileSync(new URL('./channels.json', import.meta.url)));
const self = creds.self;
if (!self?.igUserId || !self?.accessToken) {
  throw new Error('channels.json에 self.igUserId / self.accessToken이 필요하다 (README 참고)');
}

// 오늘 날짜(KST, UTC+9)
const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * 대상 계정의 팔로워 수. 못 읽으면 이유를 담아 던진다.
 *
 * business_discovery는 대상이 비공개거나 개인 계정이면 데이터를 주지 않는다 —
 * 그 경우와 토큰이 죽은 경우를 구분해서 알려줘야 어디를 고칠지 안다.
 */
async function followers(handle) {
  const fields = `business_discovery.username(${handle}){followers_count}`;
  const url = `${GRAPH}/${self.igUserId}?fields=${encodeURIComponent(fields)}&access_token=${self.accessToken}`;
  const r = await fetch(url);
  const j = await r.json();

  if (j.error) {
    const e = j.error;
    const hint =
      e.code === 110 || e.code === 100
        ? ' (대상이 공개 프로페셔널 계정인지, 핸들이 바뀌지 않았는지 확인)'
        : e.code === 190
          ? ' (토큰이 만료·무효 — README의 "토큰 다시 받기" 참고)'
          : '';
    throw new Error(`${e.message} (code ${e.code})${hint}`);
  }

  const c = j.business_discovery?.followers_count;
  if (typeof c !== 'number') throw new Error('followers_count 없음: ' + JSON.stringify(j));
  return c;
}

const failed = [];

for (const file of files) {
  const url = new URL(`./${file}`, import.meta.url);
  const data = JSON.parse(readFileSync(url));
  console.log(`\n── ${file} (${data.channels.length}개 채널)`);

  const counts = [];
  for (const ch of data.channels) {
    // 판매된 채널은 더 이상 수집하지 않고 null 기록 → 차트 선이 마지막 실측에서 끊김
    if (ch.sold) {
      console.log(`${ch.handle.padEnd(18)} ${'(판매됨 · 수집 생략)'.padStart(8)}`);
      counts.push(null);
      continue;
    }
    try {
      const c = await followers(ch.handle);
      console.log(`${ch.handle.padEnd(18)} ${String(c).padStart(8)}  (${Math.floor(c / 1000) / 10}만명)`);
      counts.push(c);
    } catch (e) {
      // 한 채널이 막혔다고 나머지까지 버리지 않는다. 그날 그 채널만 null이고,
      // 스크립트는 실패로 끝나 Actions에 빨간 X가 남는다 — 조용히 넘어가면 아무도 모른다
      console.error(`${ch.handle.padEnd(18)} ${'실패'.padStart(8)}  ${e.message}`);
      counts.push(null);
      failed.push(`${file}:${ch.handle}`);
    }
  }

  // 한 채널도 못 읽은 날은 점을 만들지 않는다. null만 든 점은 아무것도 말하지 않으면서
  // 파일에 영영 남는다 — 토큰이 죽어 있던 날들이 그대로 빈 줄로 쌓인다
  if (counts.every(c => c === null)) {
    console.log(`${kstDate} 기록할 값이 없어 점을 만들지 않음`);
    continue;
  }

  // 같은 날짜가 이미 있으면 교체, 없으면 추가
  const idx = data.points.findIndex(p => p.date === kstDate);
  const point = { date: kstDate, counts };
  if (idx >= 0) { data.points[idx] = point; console.log(`${kstDate} 기존 점 갱신`); }
  else { data.points.push(point); console.log(`${kstDate} 새 점 추가`); }

  // 날짜순 정렬 보장
  data.points.sort((a, b) => a.date.localeCompare(b.date));

  writeFileSync(url, JSON.stringify(data, null, 2) + '\n');
  console.log(`${file} 업데이트 완료`);
}

if (failed.length > 0) {
  console.error(`\n수집 실패: ${failed.join(', ')} — 위 사유를 확인할 것`);
  process.exit(1);
}
