import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile('index.html','utf8');
const window={}; const context=vm.createContext({window,console,Date});
vm.runInContext(await readFile('src/services/price.js','utf8'),context);
vm.runInContext(html.slice(html.indexOf('const GENRE4_MAP'),html.indexOf('for (let i = 0; i < events.length; i += 1)'))+'\nwindow.normalizeCultureEvent=normalizeCultureEvent;',context);
const base={id:'regression',name:'사용자 입력 행사',genre:'체험',place:'사용자 입력 장소',start:'2026-11-06',end:'2026-11-07',x:500,y:660,src:'사용자 제보',is_sample:false,comments:[]};
for(const price of [0,500,1000,3000,4500,8000,9000,10000]){
 const result=window.normalizeCultureEvent({...base,price},25);
 assert.equal(result.price_min,price);assert.equal(result.price,price);assert.equal(result.name,base.name);assert.equal(result.place,base.place);
 assert.equal(result.ben.length,0);console.log(`PASS 사용자 제보 가격 ${price}원 보존`);
}
const sample=window.normalizeCultureEvent({...base,price:8000,is_sample:true},0);
assert.equal(sample.price_min,4000);assert.equal(sample.is_sample,true);console.log('PASS 기존 예시 복수 요금 규칙 유지');
