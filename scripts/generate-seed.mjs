/** 기존 JSON을 변경하지 않고 Supabase용 INSERT SQL을 생성합니다. Node 20+ */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>JSON.parse(fs.readFileSync(path.join(root,'assets/json',name),'utf8'));
const projects=read('project.json'), exhibitions=read('exhibitions.json').exhibitions;
const members=read('members.json'), notices=read('allim.json');
const q=(v)=>v==null?'null':`'${String(v).replaceAll("'","''")}'`;
const j=(v)=>`${q(JSON.stringify(v))}::jsonb`;
const uid=(key)=>{const h=createHash('sha1').update(`comeasflower-v1:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`};
const statements=['-- 자동 생성 파일입니다. 기존 사이트 자료를 신규 테이블에 최초 입력합니다.','-- 같은 파일을 다시 실행해도 기존 편집 내용을 덮어쓰지 않습니다.','begin;'];
const report=[];
const generations=new Set();
const genNum=(key)=>Number(String(key).match(/\d+/)?.[0]);
for(const k of Object.keys(projects)) generations.add(genNum(k));
for(const section of ['past','active']) for(const k of Object.keys(members[section]||{})) generations.add(genNum(k));
const ordered=[...generations].filter(Number.isInteger).sort((a,b)=>a-b);
for(const id of ordered) statements.push(`insert into public.generations(id,label,sort_order) values(${id},${q(`${id}기`)},${id}) on conflict(id) do nothing;`);
const memberByName=new Map();
const memberRows=[];
for(const section of ['past','active'])for(const [key,people] of Object.entries(members[section]||{})){
 const gen=genNum(key);if(!Number.isInteger(gen))continue;
 for(let i=0;i<people.length;i++){
  const m=people[i],id=uid(`member:${section}:${gen}:${i}`),name=String(m.name||'').trim();
  memberRows.push({id,gen,name,contact:m.contact||'',active:section==='active',sort:i});
  if(name){if(!memberByName.has(name))memberByName.set(name,[]);memberByName.get(name).push({id,gen});}
 }
}
const findMember=(name,generation)=>{
 const matches=memberByName.get(String(name||'').trim())||[];
 return [...matches].sort((a,b)=>(b.gen===generation)-(a.gen===generation)||b.gen-a.gen)[0]?.id||null;
};
const projectMemberPairs=new Set(),workMemberPairs=new Set(),exhibitionMemberPairs=new Set();
const isPlaceholder=(value)=> !value || !String(value).trim() || /^(이미지 링크|image link|이미지|link)$/i.test(String(value).trim());
function media(raw,description){
 if(isPlaceholder(raw)){report.push(`건너뛴 이미지: ${description} — ${JSON.stringify(raw)}`);return null;}
 let v=String(raw).trim();
 const drive=v.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|[?&]id=)([A-Za-z0-9_-]{15,})/);
 if(drive) return ['google_drive',drive[1]];
 if(/^https?:\/\//.test(v))return ['r2',v]; // 외부 URL: 관리자에서 교체 권장
 if(/^(\.\.?\/|\/|assets\/)/.test(v))return ['local',v];
 if(/^[A-Za-z0-9_-]{15,}$/.test(v))return ['google_drive',v];
 report.push(`검토 필요/이미지 제외: ${description} — ${v}`);return null;
}
let projectCount=0, workCount=0, imageCount=0;
for(const [group,arr] of Object.entries(projects)){
 const generation=genNum(group);
 for(let index=0; index<arr.length;index++){
  const item=arr[index];
  const legacyId=item.id||`${generation}-missing-${index+1}`;
  if(!item.id) report.push(`누락된 프로젝트 ID 복구: ${item.name} -> ${legacyId} (공개 URL 링크 변경될 수 있음)`);
  const id=uid(`project:${generation}:${legacyId}`);
  statements.push(`insert into public.projects(id,legacy_id,generation_id,name,description,duration_text,project_type,sort_order,published) values(${q(id)},${q(legacyId)},${generation},${q(item.name||'제목 없음')},${q(item.description||'')},${q(item.duration||'')},${q(item.output||'')},${index},true) on conflict(id) do nothing;`);
  projectCount++;
  for(let widx=0;widx<(item.works||[]).length;widx++){
   const w=item.works[widx],wid=uid(`work:${generation}:${legacyId}:${widx}`);
   statements.push(`insert into public.works(id,project_id,title,description,sort_order,published) values(${q(wid)},${q(id)},${q(w.title||'')},${q(w.description||'')},${widx},true) on conflict(id) do nothing;`);
   const memberId=findMember(w.creator,generation);if(memberId){workMemberPairs.add(`${wid}:${memberId}`);projectMemberPairs.add(`${id}:${memberId}`);}
   workCount++;
   const imgs=Array.isArray(w.images)&&w.images.length?w.images:(w.image?[w.image]:[]);
   for(let i=0;i<imgs.length;i++){
    const m=media(imgs[i],`${item.name}/${w.creator||w.title||widx+1} #${i+1}`);if(!m)continue;
    const mid=uid(`image:${generation}:${legacyId}:${widx}:${i}`);
    statements.push(`insert into public.work_images(id,work_id,provider,path,alt_text,sort_order) values(${q(mid)},${q(wid)},${q(m[0])},${q(m[1])},${q(w.title||w.creator||item.name)},${i}) on conflict(id) do nothing;`);
    imageCount++;
   }
  }
 }
}
for(let i=0;i<exhibitions.length;i++){
 const e=exhibitions[i],id=uid('exhibition:'+e.id),m=media(e.image,'전시 '+e.title);
 statements.push(`insert into public.exhibitions(id,legacy_id,title,description,duration_text,place,cover_provider,cover_path,sort_order,published) values(${q(id)},${q(e.id)},${q(e.title)},${j(e.description||[])},${q(e.duration||'')},${q(e.place||'')},${q(m?.[0])},${q(m?.[1])},${i},true) on conflict(id) do nothing;`);
 for(const name of e.participants||[]){const memberId=findMember(name,0);if(memberId)exhibitionMemberPairs.add(`${id}:${memberId}`);}
}
for(const member of memberRows)statements.push(`insert into public.members(id,generation_id,name,contact,is_active,sort_order,published) values(${q(member.id)},${member.gen},${q(member.name)},${q(member.contact)},${member.active},${member.sort},true) on conflict(id) do nothing;`);
for(const pair of projectMemberPairs){const [project_id,member_id]=pair.split(':');statements.push(`insert into public.project_members(project_id,member_id) values(${q(project_id)},${q(member_id)}) on conflict do nothing;`);}
for(const pair of workMemberPairs){const [work_id,member_id]=pair.split(':');statements.push(`insert into public.work_members(work_id,member_id) values(${q(work_id)},${q(member_id)}) on conflict do nothing;`);}
for(const pair of exhibitionMemberPairs){const [exhibition_id,member_id]=pair.split(':');statements.push(`insert into public.exhibition_members(exhibition_id,member_id) values(${q(exhibition_id)},${q(member_id)}) on conflict do nothing;`);}
const memberCount=memberRows.length;
for(let i=0;i<notices.length;i++){
 const n=notices[i],id=uid(`notice:${i}`);
 statements.push(`insert into public.notices(id,title,date_text,contents,sort_order,published) values(${q(id)},${q(n.title||'제목 없음')},${q(n.date||'')},${j(n.contents||[])},${i},true) on conflict(id) do nothing;`);
}
statements.push('commit;');
fs.writeFileSync(path.join(root,'supabase','seed.sql'),statements.join('\n')+'\n');
fs.writeFileSync(path.join(root,'supabase','import-report.md'),`# JSON 이관 점검\n\n기수 ${ordered.length}개, 프로젝트 ${projectCount}개, 개별 작품 ${workCount}개, 이미지 ${imageCount}개, 전시 ${exhibitions.length}개, 멤버 ${memberCount}명, 알림 ${notices.length}개.\n\n## 검토할 항목\n${report.length?report.map(v=>'- '+v).join('\n'):'- 없음'}\n`);
console.log(`seed.sql 생성: 프로젝트 ${projectCount}, 작품 ${workCount}, 이미지 ${imageCount}, 전시 ${exhibitions.length}, 멤버 ${memberCount}, 알림 ${notices.length}; 경고 ${report.length}`);
