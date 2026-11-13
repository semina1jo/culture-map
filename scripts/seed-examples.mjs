import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// 원본 앱을 변경하지 않고 초기 예시 데이터만 실행한다. DB 호출/키는 포함하지 않는다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('const events = [');
const end = html.indexOf('const discounts = [', start);
assert(start >= 0 && end > start, '초기 예시 데이터 구간을 찾지 못했습니다.');
const sandbox = { window: { dataService: { getPlaces: () => [] } } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/services/price.js'), 'utf8'), sandbox, { timeout: 1000 });
vm.runInContext(html.slice(start, end) + '\nglobalThis.seedData = {events, foods, otherPlaces};', sandbox, { timeout: 1000 });
const { events, foods, otherPlaces } = JSON.parse(JSON.stringify(sandbox.seedData));
assert.equal(events.length, 25);
assert.equal(foods.length, 10);
assert.equal(otherPlaces.length, 10);
assert.equal(events.find(e => e.id === 'e25').price_min, null);
assert.equal(events.find(e => e.id === 'e25').price_label, '가격 확인');

const rawFields = ['CODENAME','GUNAME','TITLE','DATE','PLACE','ORG_NAME','USE_TRGT','USE_FEE','IS_FREE','MAIN_IMG','STRTDATE','END_DATE','ORG_LINK','HMPG_ADDR','LAT','LOT'];
function pick(source, keys) {
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}
const culture = events.map(e => ({
  id: e.id,
  ...Object.fromEntries(rawFields.map(key => [key.toLowerCase(), e[key] ?? null])),
  lat: Number(e.LAT), lot: Number(e.LOT),
  price_min: e.price_min, price_label: e.price_label, genre4: e.genre4,
  is_sample: true, source: '예시 데이터', user_id: null,
  meta: pick(e, ['ref','hours','reserve','entry','x','y','comments','votes','status','reports']),
  updated_at: e.updated_at
}));
const places = [
  ...foods.map(f => ({
    id:f.id, category:'식당', subcategory:f.type, name:f.name, price:f.price,
    ref_price:f.ref_price ?? null, address:f.addr, lat:f.lat, lng:f.lng,
    hours:f.hours ?? null, note:f.note ?? null,
    source:'예시 데이터', is_sample:true, user_id:null,
    meta:pick(f, ['menu','star','cnt','coupon','x','y','comments'])
  })),
  ...otherPlaces.map(p => ({
    id:p.id, category:'기타', subcategory:p.subcategory, name:p.name, price:p.price,
    ref_price:p.ref_price ?? null, address:p.address ?? p.addr ?? null,
    lat:p.lat, lng:p.lng, hours:p.hours ?? null, note:p.note ?? null,
    source:'예시 데이터', is_sample:true, user_id:null,
    meta:pick(p, ['menu','star','cnt','coupon','x','y','comments'])
  }))
];
const benefits = events.flatMap(e => e.benefit_records.map(r => ({
  rule_key:JSON.stringify([r.event_id,r.type,r.value ?? null,r.price_after,'seed']),
  ...r, value:r.value ?? null, user_id:null
})));
assert.equal(new Set(benefits.map(b => b.rule_key)).size, benefits.length);
assert(benefits.every(b => ['ageMax','ageMin','student','gu','soldier','disabled','merit','income','multi'].includes(b.type)));
assert(culture.every(e => e.is_sample && e.source === '예시 데이터' && e.user_id === null));
assert(places.every(p => p.is_sample && p.source === '예시 데이터' && p.user_id === null));

function insertSection(table, records, columns, join = '') {
  const columnNames = columns.map(c => c[0]).join(',');
  const declarations = columns.map(([name,type]) => `${name} ${type}`).join(',');
  const selectNames = columns.map(c => `s.${c[0]}`).join(',');
  return `-- ${table}: 예시 ${records.length}건. 기존 행은 변경하지 않는다.\nWITH inserted AS (\n  INSERT INTO public.${table} (${columnNames})\n  SELECT ${selectNames}\n  FROM jsonb_to_recordset($seed$${JSON.stringify(records)}$seed$::jsonb) AS s(${declarations})\n  ${join}\n  LIMIT ${records.length}\n  ON CONFLICT DO NOTHING\n  RETURNING ${table === 'event_benefits' ? 'rule_key' : 'id'}\n)\nSELECT count(${table === 'event_benefits' ? 'rule_key' : 'id'}) AS inserted_count FROM inserted LIMIT 1;\n`;
}
const cultureColumns = [
  ['id','text'], ...rawFields.filter(f => !['LAT','LOT','STRTDATE','END_DATE'].includes(f)).map(f => [f.toLowerCase(),'text']),
  ['strtdate','date'], ['end_date','date'], ['lat','numeric'], ['lot','numeric'],
  ['price_min','integer'], ['price_label','text'], ['genre4','text'], ['is_sample','boolean'],
  ['source','text'], ['user_id','uuid'], ['meta','jsonb'], ['updated_at','timestamptz']
];
const placeColumns = [['id','text'],['category','text'],['subcategory','text'],['name','text'],['price','integer'],['ref_price','integer'],['address','text'],['lat','numeric'],['lng','numeric'],['hours','text'],['note','text'],['source','text'],['is_sample','boolean'],['user_id','uuid'],['meta','jsonb']];
const benefitColumns = [['rule_key','text'],['event_id','text'],['type','text'],['value','jsonb'],['price_after','integer'],['label','text'],['auto_extracted','boolean'],['user_id','uuid']];
const sections = [
  insertSection('cultural_events',culture,cultureColumns),
  insertSection('places',places,placeColumns),
  insertSection('event_benefits',benefits,benefitColumns,"JOIN public.cultural_events AS e ON e.id=s.event_id AND e.is_sample=true AND e.source='예시 데이터' AND e.user_id IS NULL")
];
const cultureIds = culture.map(e => `'${e.id}'`).join(',');
const placeIds = places.map(p => `'${p.id}'`).join(',');
const verification = `-- 적재 확인: 예시만 조회한다. 사용자 데이터는 생성/수정/삭제하지 않는다.\nSELECT count(id) AS sample_count FROM public.cultural_events WHERE id IN (${cultureIds}) AND is_sample=true AND source='예시 데이터' AND user_id IS NULL LIMIT 1;\nSELECT id,title,price_min,price_label FROM public.cultural_events WHERE id IN ('e1','e25') AND is_sample=true AND source='예시 데이터' AND user_id IS NULL ORDER BY id LIMIT 2;\nSELECT category,count(id) AS sample_count FROM public.places WHERE id IN (${placeIds}) AND is_sample=true AND source='예시 데이터' AND user_id IS NULL GROUP BY category ORDER BY category LIMIT 2;\nSELECT id,category,name FROM public.places WHERE id IN ('f1','o1') AND is_sample=true AND source='예시 데이터' AND user_id IS NULL ORDER BY id LIMIT 2;\nSELECT count(b.rule_key) AS sample_count FROM public.event_benefits b JOIN public.cultural_events e ON e.id=b.event_id WHERE e.id IN (${cultureIds}) AND e.is_sample=true AND e.source='예시 데이터' AND e.user_id IS NULL AND b.user_id IS NULL AND b.rule_key::jsonb->>4='seed' LIMIT 1;\nSELECT b.event_id,b.type,b.value,b.price_after,b.label FROM public.event_benefits b JOIN public.cultural_events e ON e.id=b.event_id WHERE e.is_sample=true AND e.source='예시 데이터' AND e.user_id IS NULL AND b.user_id IS NULL AND b.rule_key::jsonb->>4='seed' AND b.type IN ('income','multi') ORDER BY b.event_id,b.type LIMIT 4;\n`;
fs.writeFileSync(path.join(root,'supabase/seed-examples.sql'), '-- poormap 예시 데이터 시드. DML만 포함. UUID는 DB 기본값 사용.\n\n' + sections.join('\n') + '\n' + verification);
const section = process.argv.find(a => a.startsWith('--section='))?.slice('--section='.length);
if (section !== undefined) {
  const query = section === 'verify' ? verification : sections[Number(section)];
  assert(query, '잘못된 section');
  process.stdout.write(query);
} else {
  console.log(JSON.stringify({cultural_events:culture.length,food:foods.length,other:otherPlaces.length,event_benefits:benefits.length,auto_extracted:benefits.filter(b=>b.auto_extracted).length,e25:pick(culture.find(e=>e.id==='e25'),['id','title','price_min','price_label']),sql:path.join(root,'supabase/seed-examples.sql')}, null, 2));
}
