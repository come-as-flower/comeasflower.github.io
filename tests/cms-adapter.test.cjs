const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const script=readFileSync(path.join(root,'content-adapter.js'),'utf8');
function harness(config,tables){
 const calls=[];
 const ctx={window:{FLOWER_SUPABASE:config},fetch:async(url,options)=>{
  calls.push({url,options});
  const table=String(url).match(/rest\/v1\/(\w+)/)?.[1];
  return {ok:true,json:async()=>tables[table]||[]};
 },FlowerSite:{fetchJSON:async(url)=>({legacy: url})},console};
 ctx.window.FlowerSite=ctx.FlowerSite;
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {api:ctx.window.FlowerContent,calls};
}
test('설정 없으면 기존 JSON을 그대로 읽는다',async()=>{
 const {api,calls}=harness({url:'',anonKey:''},{});
 assert.equal(api.enabled,false);
 assert.equal((await api.fetchProjects()).legacy,'../assets/json/project.json');
 assert.equal((await api.fetchExhibitions()).legacy,'../assets/json/exhibitions.json');
 assert.equal(calls.length,0);
});
test('Supabase 프로젝트/작품/이미지를 기존 사이트 데이터 모양으로 변환',async()=>{
 const {api,calls}=harness({url:'https://sample.supabase.co',anonKey:'sb_publishable_example'}, {
  projects:[{id:'uuid-p',legacy_id:'13-1',generation_id:13,name:'꽃',description:'소개',duration_text:'2026.03.',project_type:'레터링'}],
  works:[{id:'uuid-w',project_id:'uuid-p',title:'작품',description:'설명'}],
  work_images:[{id:'img',work_id:'uuid-w',provider:'google_drive',path:'1ABCDEF123456789abcdef123456789',sort_order:0}],
  project_members:[{project_id:'uuid-p',member_id:'member-1'}],
  work_members:[{work_id:'uuid-w',member_id:'member-1'}],
  members:[{id:'member-1',name:'작가'}],
  exhibitions:[{id:'uuid-e',legacy_id:'flower-night-8',title:'전시',description:['본문'],duration_text:'2026.3.',place:'장소',cover_provider:'local',cover_path:'../assets/img/exhib/exhib_8.jpeg'}],
  exhibition_images:[{id:'ei',exhibition_id:'uuid-e',provider:'google_drive',path:'1ABCDEF123456789abcdef123456789',alt_text:'전시 공간',sort_order:0}],
  exhibition_members:[{exhibition_id:'uuid-e',member_id:'member-1'}]
 });
 const p=await api.fetchProjects();
 assert.equal(p['13.0projects'][0].id,'13-1');
 assert.equal(p['13.0projects'][0].works[0].creator,'작가');
 assert.deepEqual(Array.from(p['13.0projects'][0].participants),['작가']);
 assert.match(p['13.0projects'][0].works[0].images[0],/drive\.google\.com\/thumbnail/);
 const e=await api.fetchExhibitions();
 assert.equal(e.exhibitions[0].id,'flower-night-8');
 assert.equal(e.exhibitions[0].image,'../assets/img/exhib/exhib_8.jpeg');
 assert.deepEqual(Array.from(e.exhibitions[0].participants),['작가']);
 assert.equal(e.exhibitions[0].images.length,1);
 assert.equal(e.exhibitions[0].images[0].alt,'전시 공간');
 assert.match(e.exhibitions[0].images[0].url,/drive\.google\.com\/thumbnail/);
 assert.equal(calls.length,10);
 assert.equal(calls[0].options.headers.apikey,'sb_publishable_example');
 assert.equal(calls[0].options.headers.Authorization,undefined);
 const relationCalls=calls.filter(call=>/\/(project_members|work_members|exhibition_members)\?/.test(call.url));
 assert.equal(relationCalls.length,3);
 assert.ok(relationCalls.every(call=>!call.url.includes('order=sort_order.asc')));
 const sortableCalls=calls.filter(call=>/\/(projects|works|work_images|members|exhibitions|exhibition_images)\?/.test(call.url));
 assert.ok(sortableCalls.every(call=>call.url.includes('order=sort_order.asc')));
});
test('외부 이미지 URL은 HTTPS만 허용하고 Supabase 경로는 인코딩',()=>{
 const {api}=harness({url:'https://sample.supabase.co',anonKey:'sb_publishable_example',bucket:'flower-media'},{});
 assert.equal(api.imageURL('r2','http://insecure.example.com/file.png'),'');
 assert.match(api.imageURL('supabase','works/파일 이름.webp'),/works\/%ED%8C%8C%EC%9D%BC%20%EC%9D%B4%EB%A6%84.webp$/);
});
