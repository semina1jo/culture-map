import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

// 키와 세션 토큰은 출력하거나 파일에 저장하지 않는다.
const ENV = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY };
const code = await readFile('src/services/dataService.js', 'utf8');
const origin = new URL(ENV.SUPABASE_URL).origin;
const runId = `check-${Date.now()}`;
const newIds = { reports: [], reviews: [], places: [], cultural_events: [] };
const results = [];
function check(name, value) { assert(value, name); results.push(name); console.log(`PASS ${name}`); }
function store() { const items = new Map(); return { getItem:k => items.get(k) || null, setItem:(k,v) => items.set(k,String(v)), removeItem:k => items.delete(k) }; }
async function open(storage) {
  const events = new Map();
  const window = { __ENV__: ENV, crypto: webcrypto, dispatchEvent:event => (events.get(event.type)||[]).forEach(fn=>fn(event)), addEventListener:(name,fn) => events.set(name,[...(events.get(name)||[]),fn]) };
  const context = vm.createContext({ window, localStorage: storage, fetch, console, Intl, Date, atob, CustomEvent: class { constructor(type,{detail}) { this.type=type; this.detail=detail; } } });
  vm.runInContext(code, context);
  const ready = await window.dataService.ready;
  if (!ready.ok) throw new Error(`${ready.error?.code}: ${ready.error?.message}`);
  return window.dataService;
}
function tokenFrom(storage) { return JSON.parse(storage.getItem(`geojimap-session:${origin}`)).access_token; }
async function raw(storage,path,options={}) {
  return fetch(`${origin}${path}`,{...options,headers:{apikey:ENV.SUPABASE_ANON_KEY,Authorization:`Bearer ${tokenFrom(storage)}`,'content-type':'application/json',...(options.headers||{})}});
}
const storage = store();
const first = await open(storage);
check('실제 익명 인증 및 remote 모드', first.mode==='remote');
check('문화 예시 25건 조회', first.getEvents().filter(x=>x.is_sample).length===25);
check('식당 예시 10곳 조회', first.getPlaces().filter(x=>x.category==='식당'&&x.is_sample).length===10);
check('기타 예시 10곳 조회', first.getPlaces().filter(x=>x.category==='기타'&&x.is_sample).length===10);
const id = first.userId();
const profile={birth:'2002-05-10',sido:'서울특별시',gu:'마포구',student:'univ',soldier:false,disabled:true,merit:false,multi:false,income:'near'};
check('프로필 실제 저장', (await first.saveProfile(profile)).ok);
check('문화 찜 실제 저장',(await first.saveTarget({target_type:'event',target_id:'e1'})).ok);
check('기타 찜 실제 저장',(await first.saveTarget({target_type:'place',target_id:'o1'})).ok);
const review=await first.addReview('e1',`[연결 검증 예시 ${runId}] 새로고침 확인`,'event');
check('리뷰 실제 저장',review.ok); newIds.reviews.push(review.value.id);
const item={id:`o_${runId}`,name:`연결 검증 예시 ${runId}`,category:'기타',subcategory:'무료 공간',price:0,ref_price:0,address:'홍대입구역 연결 검증 예시',lat:37.5572,lng:126.9245,hours:'검증용',source:'연결 검증 예시',is_sample:false,isNew:true,comments:[]};
const report=await first.addReport({id:item.id,tab:'기타',name:item.name,price:0,address:item.address,lat:item.lat,lng:item.lng,source_url:'https://example.com',item});
check('기타 제보와 장소 실제 저장',report.ok); newIds.reports.push(item.id);newIds.places.push(item.id);
check('일반 모드 실제 투표',(await first.addVote({report_id:item.id,vote:'right',demo_mode:false})).ok);
const duplicate=await first.addVote({report_id:item.id,vote:'right',demo_mode:false});
check('중복 투표 DB 차단',!duplicate.ok&&duplicate.error.code==='23505');
check('시연 반복 투표 분리',(await first.addVote({report_id:item.id,vote:'right',demo_mode:true})).ok);
const ledger=await first.addLedger({kind:'connection_check',amount:20,reason:`연결 검증 예시 ${runId}`});
check('티끌 원장 실제 저장',ledger.ok);
const visit=await first.recordVisit(`visit_${runId}`,true,0);
check('방문 인증과 티끌 원자적 저장',visit.ok&&visit.value.reward===100);
const again=await first.recordVisit(`visit_${runId}`,true,0);
check('같은 날 방문 중복 보상 방지',again.ok&&again.value.already&&again.value.reward===0);
const notification={id:runId,kind:'연결 검증 예시',text:'읽음 저장 확인',time:'지금',target_id:'e1',read:false};
check('알림 실제 저장',(await first.saveNotifications([notification])).ok);
check('알림 읽음 업데이트',(await first.saveNotifications([{...notification,read:true}])).ok);
const notif=await raw(storage,`/rest/v1/notifications?select=id,read&dedupe_key=eq.${runId}&limit=10`);
const notifRows=await notif.json();check('알림 중복 생성 없음',notifRows.length===1&&notifRows[0].read);
await first.flush();
const reload=await open(storage);
check('새로고침 후 동일 세션 복원',reload.userId()===id);
check('프로필 모든 필드 복원',reload.getProfile()?.disabled===true&&reload.getProfile()?.student==='univ'&&reload.getProfile()?.income==='near');
check('찜 새로고침 조회',reload.getSaved().some(x=>x.target_id==='e1')&&reload.getSaved().some(x=>x.target_id==='o1'));
check('리뷰 새로고침 조회',reload.getReviews('e1').some(x=>x.id===review.value.id));
check('제보 새로고침 조회',reload.getReports().some(x=>x.id===item.id));
check('방문 새로고침 조회',reload.getVisits().some(x=>x.event_id===`visit_${runId}`));
const anotherStorage=store();const another=await open(anotherStorage);
check('다른 익명 사용자 생성',another.userId()!==id);
const profileRead=await raw(anotherStorage,`/rest/v1/user_profiles?select=user_id&user_id=eq.${id}&limit=1`);
check('다른 사용자 프로필 RLS 격리',(await profileRead.json()).length===0);
const savedRead=await raw(anotherStorage,`/rest/v1/saved?select=id&user_id=eq.${id}&limit=1`);
check('다른 사용자 찜 RLS 격리',(await savedRead.json()).length===0);
const forbidden=await raw(anotherStorage,'/rest/v1/saved',{method:'POST',body:JSON.stringify({user_id:id,target_type:'event',target_id:'e2'})});
check('다른 사용자 행 위조 쓰기 RLS 차단',forbidden.status===403);
const seedChange=await raw(storage,'/rest/v1/places?id=eq.o1',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({name:'덮어쓰기 금지 확인'})});
check('예시/다른 작성자 장소 수정 불가',(await seedChange.json()).length===0);
await writeFile('/tmp/geojimap-supabase-check.json',JSON.stringify({runId,passed:results,newIds},null,2));
console.log(`완료: ${results.length}개 검증 통과. 검증으로 생성한 공개 예시 행 ID는 /tmp/geojimap-supabase-check.json에 기록했습니다.`);
