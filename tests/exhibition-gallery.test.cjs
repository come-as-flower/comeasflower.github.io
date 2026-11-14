const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');
const original = readFileSync(join(__dirname,'../news/exhibition.js'),'utf8');
// 공개 페이지 초기화는 별도 동작 테스트에서 검증; 이 테스트는 상세 갤러리 렌더링만 확인.
const script = original.replace(/\ninitializeExhibition\(\);\s*$/, '');
function render(items) {
  const nodes = [];
  const gallery = {
    hidden:true,
    replaceChildren(){nodes.length=0},
    appendChild(el){nodes.push(el)},
    get childElementCount(){return nodes.length}
  };
  const image = { addEventListener(){}, hidden:false };
  const title = {textContent:''};
  const text = {innerHTML:''};
  const nodesBySelector = {
    '.exhibitionGallery':gallery, '.flowerNight img':image,
    '.flowerNight h2':title, '.flowerNightText':text
  };
  const ctx = {
    document:{querySelector:s=>nodesBySelector[s]||null,createElement:tag=>({tag})},
    window:{location:{href:'https://example.github.io/repo/news/exhibition.html?id=ex1'}},
    URL,console,FlowerSite:{escapeHtml:s=>String(s),safeRichText:s=>String(s)}
  };
  vm.createContext(ctx);vm.runInContext(script,ctx);
  ctx.fixture=items;vm.runInContext('renderExhibition(fixture)',ctx);
  return {nodes,gallery,title};
}
test('전시 대표 이미지와 별도로 여러 상세 사진을 렌더링한다',()=>{
  const result=render({id:'ex1',title:'꽃밤',image:'../assets/img/exhib/exhib_1.jpg',images:[
    {url:'../assets/img/exhib/detail.jpg',alt:'설치 장면'},
    {url:'https://cdn.example.com/2.webp',alt:'전시장'}]});
  assert.equal(result.nodes.length,2);
  assert.equal(result.gallery.hidden,false);
  assert.equal(result.nodes[0].src,'https://example.github.io/repo/assets/img/exhib/detail.jpg');
  assert.equal(result.nodes[0].alt,'설치 장면');
  assert.equal(result.nodes[1].src,'https://cdn.example.com/2.webp');
});
test('기존 전시 데이터에 images가 없으면 갤러리를 숨긴다',()=>{
  const result=render({id:'ex1',title:'기존 전시',image:'../assets/img/exhib/exhib_1.jpg'});
  assert.equal(result.nodes.length,0);
  assert.equal(result.gallery.hidden,true);
});
