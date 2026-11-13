import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const items=new Map();
const storage={getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,String(v)),removeItem:k=>items.delete(k)};
const env={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY};
const window={__ENV__:env,crypto:webcrypto,dispatchEvent:()=>{}};
vm.runInNewContext(await readFile('src/services/dataService.js','utf8'),{window,localStorage:storage,fetch,console,Intl,Date,atob,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}});
const ds=window.dataService;const ready=await ds.ready;assert(ready.ok);
const runId=`extra-${Date.now()}`;
const cleanup={runId,benefit_id:null,reports:[],places:[],cultural_events:[],photo_url:null};
let total=0;
function check(title,value){assert(value,title);total++;console.log(`PASS ${title}`);}
try{
 const rules=await ds.saveBenefits([{event_id:'e1',type:'ageMax',value:10,price_after:0,label:`연결 검증 예시 ${runId}`,auto_extracted:false}]);
 check('수동 혜택 실제 저장',rules.ok);
 cleanup.benefit_id=rules.value.find(r=>r.label===`연결 검증 예시 ${runId}`).id;
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+wAAAABJRU5ErkJggg==';
 const event={id:`e_${runId}`,name:`연결 검증 예시 ${runId}`,genre:'체험',price:0,price_min:0,price_label:'무료',start:'2026-11-06',end:'2026-11-07',place:'홍대입구역 검증 예시',lat:37.5572,lng:126.9245,hours:'검증용',entry:'자유 입장',is_sample:false,src:'사용자 제보',photo:png,comments:[],isNew:true};
 cleanup.cultural_events.push(event.id);cleanup.reports.push(event.id);
 const culture=await ds.addReport({id:event.id,tab:'문화',name:event.name,genre:'체험',price:0,start_date:event.start,end_date:event.end,address:event.place,lat:event.lat,lng:event.lng,photo_url:png,source_url:'https://example.com',item:event});
 check('문화 제보 필드·사진 실제 저장',culture.ok);cleanup.photo_url=culture.value.photo_url;
 const image=await fetch(cleanup.photo_url);check('업로드 사진 실제 공개 조회',image.ok&&image.headers.get('content-type').startsWith('image/png'));
 const food={id:`f_${runId}`,name:`연결 검증 식당 예시 ${runId}`,price:5000,category:'식당',subcategory:'한식',type:'한식',menu:'검증 메뉴',address:'홍대입구역 검증 예시',lat:37.5572,lng:126.9245,hours:'검증용',is_sample:false,source:'사용자 제보',comments:[]};
 cleanup.places.push(food.id);cleanup.reports.push(food.id);
 check('식당 제보·장소 실제 저장',(await ds.addReport({id:food.id,tab:'식당',name:food.name,subcategory:'한식',price:5000,address:food.address,item:food})).ok);
 ds.update('app_state',{demoMode:false,hideSamples:true,bells:['e1'],prefs:{genres:['전시'],regions:['홍대입구'],free:false,end:true,open:false,judge:true}});
 ds.update('benefit_enabled',true);await ds.flush();
 check('설정 원격 저장 실패 없음',ds.status.error===null);
 check('실제 DB 새로고침',(await ds.refresh()).ok);
 check('설정·혜택 토글 조회 복원',ds.read().app_state?.demoMode===false&&ds.read().app_state?.prefs.free===false&&ds.read().benefit_enabled===true);
 check('문화 제보 기간·좌표·사진 복원',ds.getEvents().some(e=>e.id===event.id&&e.start==='2026-11-06'&&e.lng===126.9245&&e.photo===cleanup.photo_url));
 check('식당 제보 메뉴 복원',ds.getPlaces().some(p=>p.id===food.id&&p.menu==='검증 메뉴'));
 check('수동 혜택 조회 복원',ds.getBenefits().some(b=>b.id===cleanup.benefit_id&&b.value===10));
 check('찜 저장 추가',(await ds.saveTarget({target_type:'event',target_id:'e1'})).ok);
 check('찜 해제 실제 저장',(await ds.removeSaved({target_type:'event',target_id:'e1'})).ok);
 await ds.refresh();check('찜 해제 조회 복원',!ds.getSaved().some(s=>s.target_id==='e1'));
 console.log(`완료: ${total}개 추가 검증 통과`);
}finally{
 await writeFile('/tmp/geojimap-supabase-extra.json',JSON.stringify({...cleanup,passed:total},null,2));
}
