import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { bucket, db, imageUrl, message, parseDrive, query, ready, remove, save, upload } from './api';
import type { Project, Work, WorkImage, Exhibition, ExhibitionImage, Notice, Member, Generation, Provider, ProjectMember, WorkMember, ExhibitionMember } from './api';

type Tab='projects'|'exhibitions'|'notices'|'members';
type Visibility='all'|'published'|'draft';
const tabInfo:Record<Tab,{title:string;description:string;item:string}>={
 projects:{title:'기수별 작업 · 작업물',description:'새로 들어온 기수를 기준으로 작업을 기록하고, 참여자와 작업물을 연결합니다.',item:'작업'},
 exhibitions:{title:'전시',description:'전시 정보, 대표·상세 이미지, 참여 프로젝트를 관리합니다.',item:'전시'},
 notices:{title:'알림',description:'공개 사이트에 표시할 소식과 공지의 본문을 작성합니다.',item:'알림'},
 members:{title:'멤버',description:'기수별 멤버와 활동·공개 상태를 관리합니다.',item:'멤버'},
};
const matchesList=(published:boolean,search:string,visibility:Visibility,...values:Array<string|number|null|undefined>)=>{
 if(visibility==='published'&&!published)return false;
 if(visibility==='draft'&&published)return false;
 const keyword=search.trim().toLocaleLowerCase('ko-KR');
 return !keyword||values.some(value=>String(value??'').toLocaleLowerCase('ko-KR').includes(keyword));
};
// 개발 서버는 관리자 앱만 제공하므로 운영 사이트 주소를 별도 지정할 수 있습니다.
// 배포된 /admin/에서는 현재 프로젝트/도메인의 한 단계 위가 공개 사이트 루트입니다.
const configuredPublicSite = (import.meta.env.VITE_PUBLIC_SITE_URL || '').trim();
const publicSiteRoot = configuredPublicSite
  ? new URL(configuredPublicSite.endsWith('/') ? configuredPublicSite : configuredPublicSite + '/').href
  : import.meta.env.DEV
    ? 'https://come-as-flower.github.io/comeasflower.github.io/'
    : new URL('../', window.location.href).href;
const publicLink = (path='') => new URL(path, publicSiteRoot).href;
const blankProject=():Project=>({id:'',legacy_id:null,generation_id:13,name:'',description:'',duration_text:'',project_type:'',sort_order:0,published:false});
const blankWork=(project_id:string):Work=>({id:'',project_id,title:'',description:'',sort_order:0,published:true});
const blankExhibition=():Exhibition=>({id:'',legacy_id:null,title:'',description:[],duration_text:'',place:'',cover_provider:null,cover_path:null,sort_order:0,published:false});
const blankNotice=():Notice=>({id:'',title:'',date_text:'',contents:[],sort_order:0,published:false});
const blankMember=():Member=>({id:'',name:'',contact:'',generation_id:13,is_active:false,sort_order:0,published:true});
const isSaveId=(id:string)=>id.length>0;

export default function App(){
 const [session,setSession]=useState<Session|null>(null);
 const [checked,setChecked]=useState(false);
 const [adminCheck,setAdminCheck]=useState<{userId:string;status:'allowed'|'denied'|'error'}|null>(null);
 const adminStatus=adminCheck && adminCheck.userId===session?.user.id ? adminCheck.status : 'checking';
 const isAdmin=adminStatus==='allowed';
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [tab,setTab]=useState<Tab>('projects');
 const [listSearch,setListSearch]=useState('');
 const [visibility,setVisibility]=useState<Visibility>('all');
 const [projectGenerationFilter,setProjectGenerationFilter]=useState<'all'|number>('all');
 const [memberGenerationFilter,setMemberGenerationFilter]=useState<'all'|number>('all');
 const [dirty,setDirty]=useState(false);
 const [generationForm,setGenerationForm]=useState<{number:string;startedYear:string;activityYears:string}|null>(null);
 const [generations,setGenerations]=useState<Generation[]>([]);
 const [projects,setProjects]=useState<Project[]>([]),[selectedProject,setSelectedProject]=useState<Project|null>(null);
 const [works,setWorks]=useState<Work[]>([]),[selectedWork,setSelectedWork]=useState<Work|null>(null),[images,setImages]=useState<WorkImage[]>([]);
 const [projectMembers,setProjectMembers]=useState<ProjectMember[]>([]),[workMembers,setWorkMembers]=useState<WorkMember[]>([]),[exhibitionMembers,setExhibitionMembers]=useState<ExhibitionMember[]>([]);
 const [selectedProjectMemberIds,setSelectedProjectMemberIds]=useState<string[]>([]),[selectedWorkMemberIds,setSelectedWorkMemberIds]=useState<string[]>([]),[selectedExhibitionMemberIds,setSelectedExhibitionMemberIds]=useState<string[]>([]);
 const [exhibitions,setExhibitions]=useState<Exhibition[]>([]),[selectedExhibition,setSelectedExhibition]=useState<Exhibition|null>(null);
 const [exhibitionImages,setExhibitionImages]=useState<ExhibitionImage[]>([]);
 const [exhibitionDrive,setExhibitionDrive]=useState(''),[exhibitionExternal,setExhibitionExternal]=useState('');
 const [notices,setNotices]=useState<Notice[]>([]),[selectedNotice,setSelectedNotice]=useState<Notice|null>(null);
 const [members,setMembers]=useState<Member[]>([]),[selectedMember,setSelectedMember]=useState<Member|null>(null);
 const [driveLink,setDriveLink]=useState(''),[externalUrl,setExternalUrl]=useState('');
 const [linkedProjectIds,setLinkedProjectIds]=useState<string[]>([]);

 useEffect(()=>{
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,s)=>{
   setSession(s);
   setChecked(true);
   if(!s)setAdminCheck(null);
  });
  return ()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(!session)return;
  let active=true;
  void db.from('site_admins').select('user_id').eq('user_id',session.user.id).maybeSingle()
   .then(({data,error})=>{
    if(!active)return;
    const status=error ? 'error' : data ? 'allowed' : 'denied';
    setAdminCheck({userId:session.user.id,status});
   });
  return ()=>{active=false};
 },[session]);

 const refresh=useCallback(async()=>{
  if(!isAdmin)return;
  try{
   const [g,p,w,im,e,ei,n,m,links,projectLinks,workLinks,exhibitionMemberLinks]=await Promise.all([
    query<Generation>('generations'),query<Project>('projects'),query<Work>('works'),query<WorkImage>('work_images'),
    query<Exhibition>('exhibitions'),query<ExhibitionImage>('exhibition_images'),query<Notice>('notices'),query<Member>('members'),
    db.from('exhibition_projects').select('*').limit(1000),
    db.from('project_members').select('*').limit(1000),
    db.from('work_members').select('*').limit(1000),
    db.from('exhibition_members').select('*').limit(1000)
   ]);
   if(links.error)throw Error(`전시 연결 정보 조회 실패: ${message(links.error)}`);
   if(projectLinks.error)throw Error(`프로젝트 참여자 조회 실패: ${message(projectLinks.error)}`);
   if(workLinks.error)throw Error(`작업물 제작자 조회 실패: ${message(workLinks.error)}`);
   if(exhibitionMemberLinks.error)throw Error(`전시 참여자 조회 실패: ${message(exhibitionMemberLinks.error)}`);
   setGenerations(g);setProjects(p);setWorks(w);setImages(im);setExhibitions(e);setExhibitionImages(ei);setNotices(n);setMembers(m);
   setProjectMembers((projectLinks.data||[]) as ProjectMember[]);setWorkMembers((workLinks.data||[]) as WorkMember[]);setExhibitionMembers((exhibitionMemberLinks.data||[]) as ExhibitionMember[]);
   setSelectedProject(old=>old? p.find(v=>v.id===old.id)||null:null);
   setSelectedWork(old=>old? w.find(v=>v.id===old.id)||null:null);
   setSelectedExhibition(old=>old? e.find(v=>v.id===old.id)||null:null);
   setSelectedNotice(old=>old? n.find(v=>v.id===old.id)||null:null);
   setSelectedMember(old=>old? m.find(v=>v.id===old.id)||null:null);
   // 현재 편집 중인 전시의 연결 목록은 전시 선택 시 별도 로드
  }catch(err){setNotice('불러오기 실패: '+message(err));}
 },[isAdmin]);
 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(!dirty)return;event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return ()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);

 const act=async(action:()=>Promise<unknown>,success='저장했어요.',clearDirty=false,onSuccess?:()=>void)=>{
  setBusy(true);setNotice('');
  try{await action();setNotice(success);if(clearDirty)setDirty(false);onSuccess?.();await refresh();}catch(err){setNotice('오류: '+message(err));}
  finally{setBusy(false)}
 };
 const confirmDiscard=()=>!dirty||confirm('저장하지 않은 변경사항이 있습니다. 저장하지 않고 이동할까요?');
 const markDirtyFromEditor=(event:FormEvent<HTMLElement>)=>{
  const target=event.target as HTMLElement;
  if(target.closest('.member-filter,.project-picker-controls')||(target instanceof HTMLInputElement&&(target.type==='file'||target.type==='search')))return;
  setDirty(true);
 };
 const syncMemberLinks=async(table:'project_members'|'work_members'|'exhibition_members',parentColumn:'project_id'|'work_id'|'exhibition_id',parentId:string,memberIds:string[])=>{
   const current=await db.from(table).select('member_id').eq(parentColumn,parentId);
   if(current.error)throw current.error;
   const currentIds=new Set((current.data||[]).map(row=>row.member_id));
   const toRemove=[...currentIds].filter(id=>!memberIds.includes(id));
   if(toRemove.length){const result=await db.from(table).delete().eq(parentColumn,parentId).in('member_id',toRemove);if(result.error)throw result.error;}
   const toAdd=memberIds.filter(id=>!currentIds.has(id));
   if(toAdd.length){const result=await db.from(table).insert(toAdd.map(member_id=>({[parentColumn]:parentId,member_id})));if(result.error)throw result.error;}
 };
 const saveProject=()=>{
  if(!selectedProject)return;
  const removedCreatorLinks=workMembers.filter(link=>works.some(work=>work.id===link.work_id&&work.project_id===selectedProject.id)&&!selectedProjectMemberIds.includes(link.member_id));
  if(removedCreatorLinks.length&&!confirm(`프로젝트 참여자에서 제외한 멤버가 만든 작업물 ${removedCreatorLinks.length}개가 있어요. 해당 작업물의 만든 사람에서도 함께 제외할까요?`))return;
  void act(async()=>{
   const p=selectedProject;
   if(!p.name.trim())throw Error('프로젝트명을 입력해 주세요.');
   if(!generations.some(g=>g.id===Number(p.generation_id)))throw Error('기수를 먼저 등록해 주세요.');
   const data={generation_id:Number(p.generation_id),name:p.name.trim(),description:p.description,
    duration_text:p.duration_text,project_type:p.project_type.trim(),
    published:p.published,sort_order:p.sort_order};
   const id=await save('projects',data,p.id||undefined);
   // 작업물 제작자는 반드시 이 프로젝트의 참여자 안에 있도록 함께 정리합니다.
   for(const link of removedCreatorLinks){
    const result=await db.from('work_members').delete().eq('work_id',link.work_id).eq('member_id',link.member_id);
    if(result.error)throw result.error;
   }
   await syncMemberLinks('project_members','project_id',id,selectedProjectMemberIds);
   setSelectedProject({...p,id});
   setSelectedWorkMemberIds(ids=>ids.filter(memberId=>selectedProjectMemberIds.includes(memberId)));
  },'작업을 저장했어요.',true);
 };
 const saveWork=()=>selectedWork && act(async()=>{
   const w=selectedWork;
   if(!isSaveId(w.project_id))throw Error('프로젝트를 먼저 저장하세요.');
   const id=await save('works',{project_id:w.project_id,title:w.title,description:w.description,sort_order:w.sort_order,published:w.published},w.id||undefined);
   await syncMemberLinks('work_members','work_id',id,selectedWorkMemberIds);
   setSelectedWork({...w,id});
 },'작업물을 저장했어요.',true);
 const saveExhibition=()=>selectedExhibition && act(async()=>{
   const e=selectedExhibition;
   if(!e.title.trim())throw Error('전시 제목을 입력해 주세요.');
   const id=await save('exhibitions',{title:e.title.trim(),description:e.description,duration_text:e.duration_text,
    place:e.place,cover_provider:e.cover_provider,cover_path:e.cover_path,
    sort_order:e.sort_order,published:e.published},e.id||undefined);
   setSelectedExhibition({...e,id});
   const current=await db.from('exhibition_projects').select('project_id').eq('exhibition_id',id);
   if(current.error)throw current.error;
   const currentIds=new Set((current.data||[]).map(v=>v.project_id));
   const toRemove=[...currentIds].filter(v=>!linkedProjectIds.includes(v));
   if(toRemove.length){const out=await db.from('exhibition_projects').delete().eq('exhibition_id',id).in('project_id',toRemove);if(out.error)throw out.error;}
   const toAdd=linkedProjectIds.filter(v=>!currentIds.has(v));
   if(toAdd.length){const out=await db.from('exhibition_projects').insert(toAdd.map(project_id=>({exhibition_id:id,project_id})));if(out.error)throw out.error;}
   await syncMemberLinks('exhibition_members','exhibition_id',id,selectedExhibitionMemberIds);
 },'전시를 저장했어요.',true);
 const addExhibitionImage=async(provider:Provider,path:string,order?:number)=>{
   const e=selectedExhibition;
   if(!e?.id)throw Error('전시를 먼저 저장해 주세요.');
   const result=await db.from('exhibition_images').insert({exhibition_id:e.id,provider,path,
    alt_text:e.title||'전시 상세 이미지',sort_order:order ?? exhibitionImages.filter(v=>v.exhibition_id===e.id).length});
   if(result.error)throw result.error;
 };
 const uploadExhibitionFiles=async(files:FileList|null)=>{
   const e=selectedExhibition;
   if(!files?.length||!e?.id){setNotice('전시를 먼저 저장해 주세요.');return;}
   await act(async()=>{
     let order=exhibitionImages.filter(v=>v.exhibition_id===e.id).length;
     for(const file of Array.from(files)){
       const path=await upload(file,e.id,'exhibitions/details');
       try{await addExhibitionImage('supabase',path,order++);}catch(err){await db.storage.from(bucket).remove([path]);throw err;}
     }
   },`${files.length}개 전시 상세 이미지를 업로드했어요.`);
 };
 const changeExhibitionImageOrder=(item:ExhibitionImage,offset:number)=>{
   const sorted=exhibitionImages.filter(v=>v.exhibition_id===item.exhibition_id).sort((a,b)=>a.sort_order-b.sort_order);
   const index=sorted.findIndex(v=>v.id===item.id), other=sorted[index+offset];
   if(!other)return;
   void act(async()=>{
     const first=await db.from('exhibition_images').update({sort_order:other.sort_order}).eq('id',item.id);
     if(first.error)throw first.error;
     const second=await db.from('exhibition_images').update({sort_order:item.sort_order}).eq('id',other.id);
     if(second.error)throw second.error;
   },'전시 이미지 순서를 변경했어요.');
 };
 const removeExhibitionImage=(item:ExhibitionImage)=>{
   if(!confirm('이 전시 상세 이미지를 삭제할까요?'))return;
   void act(async()=>{
     await remove('exhibition_images',item.id);
     if(item.provider==='supabase'){
       const out=await db.storage.from(bucket).remove([item.path]);
       if(out.error)throw Error('DB에서 삭제됐지만 이미지 파일 삭제에 실패했어요: '+out.error.message);
     }
   },'전시 이미지를 삭제했어요.');
 };
 const saveNotice=()=>selectedNotice && act(async()=>{
   const n=selectedNotice;if(!n.title.trim())throw Error('제목을 입력해 주세요.');
   const id=await save('notices',{title:n.title,date_text:n.date_text,contents:n.contents,sort_order:n.sort_order,published:n.published},n.id||undefined);
   setSelectedNotice({...n,id});
 },'알림을 저장했어요.',true);
 const saveMember=()=>selectedMember && act(async()=>{
   const m=selectedMember;if(!m.name.trim())throw Error('이름을 입력해 주세요.');
   const id=await save('members',{name:m.name,contact:m.contact,generation_id:Number(m.generation_id),is_active:m.is_active,sort_order:m.sort_order,published:m.published},m.id||undefined);
   setSelectedMember({...m,id});
 },'멤버를 저장했어요.',true);
 const removeWithConfirmation=(table:string,id:string,label:string,clear:()=>void)=>{
   if(!confirm(`${label}을(를) 삭제할까요? 연결된 작품과 이미지 정보도 함께 삭제될 수 있어요. 이 작업은 되돌릴 수 없습니다.`))return;
   void act(async()=>{await remove(table,id);clear()},'삭제했어요.',true);
 };
 const selectExhibition=(e:Exhibition)=>{
   if(!confirmDiscard())return;
   setDirty(false);
   setSelectedExhibition({...e});
   setSelectedExhibitionMemberIds(exhibitionMembers.filter(link=>link.exhibition_id===e.id).map(link=>link.member_id));
   if(!e.id){setLinkedProjectIds([]);return;}
   void db.from('exhibition_projects').select('project_id').eq('exhibition_id',e.id)
    .then(({data,error})=>{if(error)setNotice(error.message);else setLinkedProjectIds((data||[]).map(v=>v.project_id))});
 };
 const selectProject=(project:Project)=>{
   if(!confirmDiscard())return;
   setDirty(false);
   setSelectedProject({...project});
   setSelectedProjectMemberIds(projectMembers.filter(link=>link.project_id===project.id).map(link=>link.member_id));
   setSelectedWork(null);setSelectedWorkMemberIds([]);
 };
 const selectWork=(work:Work)=>{
   if(!confirmDiscard())return;
   setDirty(false);
   setSelectedWork({...work});
   setSelectedWorkMemberIds(workMembers.filter(link=>link.work_id===work.id).map(link=>link.member_id));
 };
 const linkImage=async(provider:Provider,path:string,position?:number)=>{
   const w=selectedWork;
   if(!w?.id)throw Error('작품을 먼저 저장해 주세요.');
   const out=await db.from('work_images').insert({work_id:w.id,provider,path,alt_text:w.title||'작업물 이미지',sort_order:position ?? images.filter(v=>v.work_id===w.id).length});
   if(out.error)throw out.error;
 };
 const onFiles=async(files:FileList|null)=>{
   const w=selectedWork;if(!files?.length||!w?.id){setNotice('작품을 먼저 저장해 주세요.');return;}
   await act(async()=>{
     let nextPosition=images.filter(v=>v.work_id===w.id).length;
     for(const f of Array.from(files)){
       const path=await upload(f,w.id);
       try{await linkImage('supabase',path,nextPosition++)}catch(e){await db.storage.from(bucket).remove([path]);throw e}
     }
   },`${files.length}개 이미지를 업로드했어요.`);
 };
 const changeImageOrder=(item:WorkImage,offset:number)=>{
   const sorted=images.filter(v=>v.work_id===item.work_id).sort((a,b)=>a.sort_order-b.sort_order);
   const index=sorted.findIndex(v=>v.id===item.id),other=sorted[index+offset];if(!other)return;
   void act(async()=>{
     // 동일한 sort_order를 잠시 허용하고 교환
     const a=await db.from('work_images').update({sort_order:other.sort_order}).eq('id',item.id);if(a.error)throw a.error;
     const b=await db.from('work_images').update({sort_order:item.sort_order}).eq('id',other.id);if(b.error)throw b.error;
   },'이미지 순서를 변경했어요.');
 };
 const imageRemove=(item:WorkImage)=>{
   if(!confirm('이 이미지를 작품에서 삭제할까요?'))return;
   void act(async()=>{
     await remove('work_images',item.id);
     if(item.provider==='supabase'){
       const r=await db.storage.from(bucket).remove([item.path]);
       if(r.error)throw Error('DB에서 삭제됐지만 파일 삭제에 실패했어요: '+r.error.message);
     }
   },'이미지를 삭제했어요.');
 };
 const selectNotice=(notice:Notice)=>{if(!confirmDiscard())return;setDirty(false);setSelectedNotice({...notice});};
 const selectMember=(member:Member)=>{if(!confirmDiscard())return;setDirty(false);setSelectedMember({...member});};
 const createGeneration=()=>{if(!confirmDiscard())return;setDirty(false);setGenerationForm({number:String(Math.max(0,...generations.map(g=>g.id))+1),startedYear:String(new Date().getFullYear()),activityYears:'2'});};
 const saveGeneration=()=>{
  if(!generationForm)return;
  const number=Number(generationForm.number),startedYear=Number(generationForm.startedYear),activityYears=Number(generationForm.activityYears);
  if(!Number.isInteger(number)||number<1){setNotice('기수는 1 이상의 정수여야 해요.');return;}
  if(!Number.isInteger(startedYear)||startedYear<2000||startedYear>2200){setNotice('입회 연도는 2000~2200 사이의 연도로 입력해 주세요.');return;}
  if(!Number.isInteger(activityYears)||activityYears<1||activityYears>4){setNotice('활동 기간은 1~4년 사이로 입력해 주세요.');return;}
  void act(async()=>{const result=await db.from('generations').insert({id:number,label:`${number}기`,started_year:startedYear,activity_years:activityYears,sort_order:number});if(result.error)throw result.error;},'기수를 추가했어요.',false,()=>setGenerationForm(null));
 };

 if(!ready)return <main className="center narrow"><h1>꽃 · 관리자</h1><p>Supabase 연결 정보가 비어 있어요.</p><p><code>/supabase-config.js</code>의 프로젝트 URL과 공개 가능한 publishable/anon 키를 입력하세요. 개발 서버라면 <code>admin-app/.env</code>도 사용할 수 있어요.</p><a href={publicLink()}>사이트로 돌아가기</a></main>;
 if(!checked)return <main className="center"><p>인증 상태 확인 중…</p></main>;
 if(!session)return <main className="center narrow"><h1>꽃 · 관리자</h1><p>등록된 관리자 계정으로 로그인해 주세요.</p><form onSubmit={async ev=>{ev.preventDefault();setBusy(true);setNotice('');const {error}=await db.auth.signInWithPassword({email,password});if(error)setNotice(error.message);setBusy(false)}}>
 <label>이메일<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>비밀번호<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <button disabled={busy} type="submit">로그인</button></form><p role="status">{notice}</p><a href={publicLink()}>사이트로 돌아가기</a></main>;
 if(adminStatus==='checking')return <main className="center"><p role="status">관리자 권한 확인 중…</p></main>;
 if(adminStatus==='error')return <main className="center narrow"><h1>관리자 권한을 확인하지 못했어요.</h1><button onClick={()=>window.location.reload()}>다시 시도</button><button onClick={()=>void db.auth.signOut()}>로그아웃</button></main>;
 if(adminStatus==='denied')return <main className="center narrow"><h1>접근 권한 없음</h1><p>로그인한 계정이 관리자 목록에 없어요. Supabase의 site_admins에 사용자 UUID를 추가해야 해요.</p><button onClick={()=>void db.auth.signOut()}>로그아웃</button></main>;
 const visibleWorks=works.filter(w=>w.project_id===selectedProject?.id).sort((a,b)=>a.sort_order-b.sort_order);
 const visibleImages=images.filter(i=>i.work_id===selectedWork?.id).sort((a,b)=>a.sort_order-b.sort_order);
 const visibleExhibitionImages=exhibitionImages.filter(i=>i.exhibition_id===selectedExhibition?.id).sort((a,b)=>a.sort_order-b.sort_order);
 const projectList=[...projects].sort((a,b)=>b.generation_id-a.generation_id||a.sort_order-b.sort_order).filter(p=>projectGenerationFilter==='all'||p.generation_id===projectGenerationFilter).filter(p=>matchesList(p.published,listSearch,visibility,p.name,p.project_type,p.generation_id));
 const exhibitionList=[...exhibitions].sort((a,b)=>a.sort_order-b.sort_order).filter(e=>matchesList(e.published,listSearch,visibility,e.title,e.duration_text,e.place));
 const noticeList=[...notices].sort((a,b)=>a.sort_order-b.sort_order).filter(n=>matchesList(n.published,listSearch,visibility,n.title,n.date_text));
 const memberList=[...members].sort((a,b)=>b.generation_id-a.generation_id||a.sort_order-b.sort_order).filter(m=>(memberGenerationFilter==='all'||m.generation_id===memberGenerationFilter)&&matchesList(m.published,listSearch,visibility,m.name,m.contact,m.generation_id));
 const activeItems={projects,exhibitions,notices,members}[tab];
 const activePublished=activeItems.filter(item=>item.published).length;
 const info=tabInfo[tab];
 const selectedProjectParticipants=members.filter(member=>selectedProjectMemberIds.includes(member.id));
 const memberNames=(ids:string[])=>members.filter(member=>ids.includes(member.id)).map(member=>member.name);
 const workMemberNames=(workId:string)=>memberNames(workMembers.filter(link=>link.work_id===workId).map(link=>link.member_id));
 return <div className="app">
  <header><div><a className="wordmark" href={publicLink()}><img src={publicLink('assets/img/logo.png')} alt="꽃" /></a><span>콘텐츠 관리자</span></div><div className="header-actions"><a href={publicLink()} target="_blank" rel="noreferrer">공개 사이트 <span aria-hidden>↗</span></a><button className="outline" onClick={createGeneration}>+ 기수</button><button className="outline" onClick={()=>{if(confirmDiscard()){setDirty(false);void refresh();}}}>새로고침</button><button className="outline" onClick={()=>{if(confirmDiscard())void db.auth.signOut()}}>로그아웃</button></div></header>
  <nav aria-label="콘텐츠 종류">{([['projects','프로젝트 · 작품'],['exhibitions','전시'],['notices','알림'],['members','멤버']] as [Tab,string][]).map(([key,label])=><button key={key} aria-current={tab===key?'page':undefined} onClick={()=>{if(!confirmDiscard())return;setDirty(false);setTab(key);setNotice('');setListSearch('');setVisibility('all')}}>{label}</button>)}</nav>
  {generationForm&&<div className="modal-backdrop" role="presentation"><form className="generation-form" aria-labelledby="generation-form-title" onSubmit={event=>{event.preventDefault();saveGeneration();}}><h2 id="generation-form-title">새 기수 추가</h2><label>기수<input autoFocus inputMode="numeric" value={generationForm.number} onChange={event=>setGenerationForm({...generationForm,number:event.target.value})} placeholder="14"/></label><label>입회 연도<input inputMode="numeric" value={generationForm.startedYear} onChange={event=>setGenerationForm({...generationForm,startedYear:event.target.value})} placeholder="2027"/></label><label>활동 기간(년)<input inputMode="numeric" value={generationForm.activityYears} onChange={event=>setGenerationForm({...generationForm,activityYears:event.target.value})} placeholder="2"/></label><p>기수는 기본 2년 활동으로 입력됩니다. 필요하면 활동 기간을 조정하세요.</p><div><button type="button" className="outline" disabled={busy} onClick={()=>setGenerationForm(null)}>취소</button><button disabled={busy} type="submit">기수 추가</button></div></form></div>}
  <main><div className="flash" role="status" aria-live="polite">{busy?'처리 중…':notice}</div>
  <section className="workspace-intro" aria-labelledby="workspace-title"><div><p className="eyebrow">콘텐츠 관리</p><h1 id="workspace-title">{info.title}</h1><p>{info.description}</p></div><dl className="content-summary"><div><dt>전체</dt><dd>{activeItems.length}</dd></div><div><dt>공개</dt><dd>{activePublished}</dd></div><div><dt>비공개</dt><dd>{activeItems.length-activePublished}</dd></div></dl></section>
  {tab==='projects'&&<div className="columns">
    <section className="panel browser"><div className="section-head"><h2>작업 <span className="count">{projectList.length}/{projects.length}</span></h2><button onClick={()=>{if(!confirmDiscard())return;setDirty(false);setSelectedProject({...blankProject(),generation_id:generations.at(-1)?.id||13,sort_order:projects.length});setSelectedProjectMemberIds([]);setSelectedWork(null);setSelectedWorkMemberIds([])}}>+ 추가</button></div>
    <ListControls item={info.item} search={listSearch} visibility={visibility} onSearch={setListSearch} onVisibility={setVisibility} generations={generations} generationFilter={projectGenerationFilter} onGenerationFilter={setProjectGenerationFilter}/>
    <div className="item-list">{projectList.map(p=><button key={p.id} className={selectedProject?.id===p.id?'selected':''} onClick={()=>selectProject(p)}>
      <strong>{p.name}</strong><small>{p.generation_id}기 · {p.project_type||'종류 미정'} · <VisibilityBadge published={p.published}/></small></button>)}{projectList.length===0&&<p className="list-empty">조건에 맞는 작업이 없어요.</p>}</div></section>
    <section className="panel editor" onChangeCapture={markDirtyFromEditor}>{selectedProject?<>
      <div className="section-head"><h2>작업 편집</h2>{selectedProject.id&&<button className="danger outline" onClick={()=>removeWithConfirmation('projects',selectedProject.id,'작업',()=>{setSelectedProject(null);setSelectedProjectMemberIds([]);setSelectedWork(null);setSelectedWorkMemberIds([])})}>삭제</button>}</div>
      <div className="form-grid"><label>기수<select value={selectedProject.generation_id} onChange={e=>setSelectedProject({...selectedProject,generation_id:Number(e.target.value)})}>{generations.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
      <label>작업 종류<input value={selectedProject.project_type} onChange={e=>setSelectedProject({...selectedProject,project_type:e.target.value})} placeholder="레터링, 워크숍"/></label></div>
      <p className="hint">작업은 새로 들어온 기수를 기준으로 기록합니다. 이전 기수와 함께한 경우에도 해당 연도의 새 기수를 선택해 주세요.</p>
      <label>작업명<input value={selectedProject.name} onChange={e=>setSelectedProject({...selectedProject,name:e.target.value})}/></label>
      <label>설명<textarea rows={3} value={selectedProject.description} onChange={e=>setSelectedProject({...selectedProject,description:e.target.value})}/></label>
      <label>활동 기간(표시용)<input value={selectedProject.duration_text} onChange={e=>setSelectedProject({...selectedProject,duration_text:e.target.value})} placeholder="2026.03.01. - 2026.04.30."/></label>
      <MemberPicker title="프로젝트 참여자" hint="이 작업에 함께한 멤버를 선택하세요. 아래 작업물의 제작자는 여기에서 선택한 멤버 안에서 고릅니다." members={members} selectedIds={selectedProjectMemberIds} onChange={setSelectedProjectMemberIds}/>
      <label className="check"><input type="checkbox" checked={selectedProject.published} onChange={e=>setSelectedProject({...selectedProject,published:e.target.checked})}/> 사이트에 공개</label>
      <div className="save-row"><button disabled={busy} onClick={saveProject}>작업 저장</button><span>{selectedProject.id?'저장한 뒤 작업물과 이미지를 이어서 관리할 수 있어요.':'먼저 기본 정보를 저장하면 작업물을 추가할 수 있어요.'}</span></div>
      {selectedProject.id&&<><div className="section-head work-title"><h3>작업물 <span className="count">{visibleWorks.length}</span></h3><button className="outline" onClick={()=>{if(!confirmDiscard())return;setDirty(false);setSelectedWork({...blankWork(selectedProject.id),sort_order:visibleWorks.length});setSelectedWorkMemberIds([])}}>+ 작업물 추가</button></div>
        <div className="chips">{visibleWorks.map((w,i)=><button key={w.id} className={selectedWork?.id===w.id?'selected':''} onClick={()=>selectWork(w)}>{i+1}. {w.title||workMemberNames(w.id).join(', ')||'제목 없음'}</button>)}</div>
        {selectedWork&&<section className="subpanel"><div className="section-head"><h3>작품 편집</h3>{selectedWork.id&&<button className="danger outline" onClick={()=>removeWithConfirmation('works',selectedWork.id,'작품',()=>setSelectedWork(null))}>작품 삭제</button>}</div>
          <label>작업물 제목<input value={selectedWork.title} onChange={e=>setSelectedWork({...selectedWork,title:e.target.value})}/></label>
          <label>작업물 설명<textarea rows={3} value={selectedWork.description} onChange={e=>setSelectedWork({...selectedWork,description:e.target.value})}/></label>
          <MemberPicker title="만든 사람" hint={selectedProjectParticipants.length?'프로젝트 참여자 중 이 작업물을 만든 멤버를 선택하세요.':'먼저 프로젝트 참여자를 선택하고 저장해 주세요.'} members={selectedProjectParticipants} selectedIds={selectedWorkMemberIds} onChange={setSelectedWorkMemberIds}/>
          <div className="form-grid"><label>작업물 순서<input type="number" value={selectedWork.sort_order} onChange={e=>setSelectedWork({...selectedWork,sort_order:Number(e.target.value)})}/></label><label className="check"><input type="checkbox" checked={selectedWork.published} onChange={e=>setSelectedWork({...selectedWork,published:e.target.checked})}/> 작업물 공개</label></div>
          <button disabled={busy} onClick={saveWork}>작업물 저장</button>
          {selectedWork.id&&<><h3>이미지 <span className="count">{visibleImages.length}장</span></h3><div className="image-grid">{visibleImages.map((im,i)=><div className="image-card" key={im.id}><img src={imageUrl(im.provider,im.path)} alt={im.alt_text||`${i+1}번 이미지`}/><div className="image-actions"><button className="outline" disabled={busy||i===0} onClick={()=>changeImageOrder(im,-1)} aria-label="앞으로 이동">←</button><span>{i+1}</span><button className="outline" disabled={busy||i===visibleImages.length-1} onClick={()=>changeImageOrder(im,1)} aria-label="뒤로 이동">→</button><button className="danger outline" disabled={busy} onClick={()=>imageRemove(im)}>삭제</button></div></div>)}</div>
            <label className="upload-zone">+ 파일 선택 (여러 장 가능, JPG/PNG/WebP → WebP 자동 변환)<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void onFiles(e.target.files);e.target.value=''}}/></label>
            <div className="form-grid"><label>Google Drive 링크/ID<input value={driveLink} placeholder="https://drive.google.com/file/d/..." onChange={e=>setDriveLink(e.target.value)}/></label><button className="outline align-end" disabled={busy} onClick={()=>void act(async()=>{const id=parseDrive(driveLink);if(!id)throw Error('Google Drive 파일 링크/ID를 확인해 주세요.');await linkImage('google_drive',id);setDriveLink('')})}>드라이브 이미지 추가</button></div>
            <div className="form-grid"><label>외부 HTTPS 이미지 URL (R2 등)<input value={externalUrl} placeholder="https://cdn.example.com/image.webp" onChange={e=>setExternalUrl(e.target.value)}/></label><button className="outline align-end" disabled={busy} onClick={()=>void act(async()=>{if(!/^https:\/\//.test(externalUrl))throw Error('HTTPS 이미지 주소만 지원해요.');await linkImage('r2',externalUrl.trim());setExternalUrl('')})}>외부 이미지 추가</button></div>
            </>}</section>}
      </>}
    </>:<p className="empty">왼쪽에서 프로젝트를 선택하거나 새로 추가해 주세요.</p>}</section>
  </div>}
  {tab==='exhibitions'&&<div className="columns"><section className="panel browser"><div className="section-head"><h2>꽃밤 전시 <span className="count">{exhibitionList.length}/{exhibitions.length}</span></h2><button onClick={()=>{selectExhibition({...blankExhibition(),sort_order:exhibitions.length});setSelectedExhibitionMemberIds([])}}>+ 추가</button></div><ListControls item={info.item} search={listSearch} visibility={visibility} onSearch={setListSearch} onVisibility={setVisibility}/><div className="item-list">{exhibitionList.map(e=><button key={e.id} className={selectedExhibition?.id===e.id?'selected':''} onClick={()=>selectExhibition(e)}><strong>{e.title}</strong><small>{e.duration_text} · <VisibilityBadge published={e.published}/></small></button>)}{exhibitionList.length===0&&<p className="list-empty">조건에 맞는 전시가 없어요.</p>}</div></section>
    <section className="panel editor" onChangeCapture={markDirtyFromEditor}>{selectedExhibition?<><div className="section-head"><h2>전시 편집</h2>{selectedExhibition.id&&<button className="danger outline" onClick={()=>removeWithConfirmation('exhibitions',selectedExhibition.id,'전시',()=>setSelectedExhibition(null))}>삭제</button>}</div>
      <label>제목<input value={selectedExhibition.title} onChange={e=>setSelectedExhibition({...selectedExhibition,title:e.target.value})}/></label>
      <label>소개 (문단 사이 빈 줄)<textarea rows={6} value={selectedExhibition.description.join('\n\n')} onChange={e=>setSelectedExhibition({...selectedExhibition,description:e.target.value.split(/\n\s*\n/).filter(Boolean)})}/></label>
      <div className="form-grid"><label>기간<input value={selectedExhibition.duration_text} onChange={e=>setSelectedExhibition({...selectedExhibition,duration_text:e.target.value})}/></label><label>장소<input value={selectedExhibition.place} onChange={e=>setSelectedExhibition({...selectedExhibition,place:e.target.value})}/></label></div>
      <MemberPicker title="전시 참여자" hint="꽃밤 전시에 참여한 멤버를 선택하세요." members={members} selectedIds={selectedExhibitionMemberIds} onChange={setSelectedExhibitionMemberIds}/>
      <MediaFields title="전시 대표 이미지" provider={selectedExhibition.cover_provider} path={selectedExhibition.cover_path} onChange={(cover_provider,cover_path)=>setSelectedExhibition({...selectedExhibition,cover_provider,cover_path})}
       onUpload={selectedExhibition.id?file=>act(async()=>{
        const path=await upload(file,selectedExhibition.id,'exhibitions');
        const result=await db.from('exhibitions').update({cover_provider:'supabase',cover_path:path}).eq('id',selectedExhibition.id);
        if(result.error){await db.storage.from(bucket).remove([path]);throw result.error;}
        setSelectedExhibition({...selectedExhibition,cover_provider:'supabase',cover_path:path});
       },'전시 이미지를 업로드했어요.'):undefined}/>
      <div className="section-head gallery-title"><h3>전시 상세 이미지 <span className="count">{visibleExhibitionImages.length}장</span></h3></div>
      <p className="hint">대표 이미지와 별도로, 전시 상세 페이지 하단에 순서대로 표시됩니다. 전시를 먼저 저장하면 추가할 수 있어요.</p>
      {selectedExhibition.id&&<>
       <div className="image-grid">{visibleExhibitionImages.map((im,i)=><div className="image-card" key={im.id}>
        <img loading="lazy" src={imageUrl(im.provider,im.path)} alt={im.alt_text||`전시 상세 이미지 ${i+1}`}/>
        <div className="image-actions"><button className="outline" disabled={busy||i===0} onClick={()=>changeExhibitionImageOrder(im,-1)} aria-label="앞으로 이동">←</button><span>{i+1}</span><button className="outline" disabled={busy||i===visibleExhibitionImages.length-1} onClick={()=>changeExhibitionImageOrder(im,1)} aria-label="뒤로 이동">→</button><button className="danger outline" disabled={busy} onClick={()=>removeExhibitionImage(im)}>삭제</button></div>
       </div>)}</div>
       <label className="upload-zone">+ 전시 상세 이미지 업로드 (여러 장, 자동 WebP 변환)<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>{void uploadExhibitionFiles(event.target.files);event.target.value=''}}/></label>
       <div className="form-grid"><label>Google Drive 링크 / ID<input value={exhibitionDrive} onChange={event=>setExhibitionDrive(event.target.value)} placeholder="https://drive.google.com/file/d/..."/></label><button className="outline align-end" disabled={busy} onClick={()=>void act(async()=>{const id=parseDrive(exhibitionDrive);if(!id)throw Error('Google Drive 파일 링크를 확인해 주세요.');await addExhibitionImage('google_drive',id);setExhibitionDrive('')})}>드라이브 이미지 추가</button></div>
       <div className="form-grid"><label>외부 HTTPS 이미지 URL (R2 등)<input value={exhibitionExternal} onChange={event=>setExhibitionExternal(event.target.value)} placeholder="https://cdn.example.com/image.webp"/></label><button className="outline align-end" disabled={busy} onClick={()=>void act(async()=>{if(!/^https:\/\//.test(exhibitionExternal))throw Error('HTTPS URL을 입력해 주세요.');await addExhibitionImage('r2',exhibitionExternal.trim());setExhibitionExternal('')})}>외부 이미지 추가</button></div>
      </>}
      <ProjectPicker projects={projects} selectedIds={linkedProjectIds} onChange={setLinkedProjectIds}/>
      <label className="check"><input type="checkbox" checked={selectedExhibition.published} onChange={e=>setSelectedExhibition({...selectedExhibition,published:e.target.checked})}/> 사이트에 공개</label>
      <div className="save-row"><button disabled={busy} onClick={saveExhibition}>전시 저장</button><span>{selectedExhibition.id?'상세 이미지는 전시를 저장한 뒤 추가할 수 있어요.':'먼저 기본 정보를 저장해 주세요.'}</span></div></>:<p className="empty">전시를 선택하세요.</p>}</section></div>}
  {tab==='notices'&&<div className="columns"><section className="panel browser"><div className="section-head"><h2>알림 <span className="count">{noticeList.length}/{notices.length}</span></h2><button onClick={()=>{if(!confirmDiscard())return;setDirty(false);setSelectedNotice({...blankNotice(),sort_order:notices.length})}}>+ 추가</button></div><ListControls item={info.item} search={listSearch} visibility={visibility} onSearch={setListSearch} onVisibility={setVisibility}/><div className="item-list">{noticeList.map(n=><button key={n.id} className={selectedNotice?.id===n.id?'selected':''} onClick={()=>selectNotice(n)}><strong>{n.title}</strong><small>{n.date_text} · <VisibilityBadge published={n.published}/></small></button>)}{noticeList.length===0&&<p className="list-empty">조건에 맞는 알림이 없어요.</p>}</div></section><section className="panel editor" onChangeCapture={markDirtyFromEditor}>{selectedNotice?<><div className="section-head"><h2>알림 편집</h2>{selectedNotice.id&&<button className="danger outline" onClick={()=>removeWithConfirmation('notices',selectedNotice.id,'알림',()=>setSelectedNotice(null))}>삭제</button>}</div>
    <label>제목<input value={selectedNotice.title} onChange={e=>setSelectedNotice({...selectedNotice,title:e.target.value})}/></label><label>날짜<input value={selectedNotice.date_text} onChange={e=>setSelectedNotice({...selectedNotice,date_text:e.target.value})}/></label><label>본문 (문단 사이 빈 줄)<textarea rows={14} value={selectedNotice.contents.join('\n\n')} onChange={e=>setSelectedNotice({...selectedNotice,contents:e.target.value.split(/\n\s*\n/).filter(Boolean)})}/></label>
    <label className="check"><input type="checkbox" checked={selectedNotice.published} onChange={e=>setSelectedNotice({...selectedNotice,published:e.target.checked})}/> 사이트에 공개</label><div className="save-row"><button disabled={busy} onClick={saveNotice}>알림 저장</button><span>비공개로 저장하면 공개 사이트에 표시되지 않아요.</span></div></>:<p className="empty">알림을 선택하세요.</p>}</section></div>}
  {tab==='members'&&<div className="columns"><section className="panel browser"><div className="section-head"><h2>멤버 <span className="count">{memberList.length}/{members.length}</span></h2><button onClick={()=>{if(!confirmDiscard())return;setDirty(false);setSelectedMember({...blankMember(),generation_id:generations.at(-1)?.id||13,sort_order:members.length})}}>+ 추가</button></div><ListControls item={info.item} search={listSearch} visibility={visibility} onSearch={setListSearch} onVisibility={setVisibility} generations={generations} generationFilter={memberGenerationFilter} onGenerationFilter={setMemberGenerationFilter}/><div className="item-list">{memberList.map(m=><button key={m.id} className={selectedMember?.id===m.id?'selected':''} onClick={()=>selectMember(m)}><strong>{m.name}</strong><small>{m.generation_id}기 · {m.is_active?'활동 중':'과거'} · <VisibilityBadge published={m.published}/></small></button>)}{memberList.length===0&&<p className="list-empty">조건에 맞는 멤버가 없어요.</p>}</div></section><section className="panel editor" onChangeCapture={markDirtyFromEditor}>{selectedMember?<><div className="section-head"><h2>멤버 편집</h2>{selectedMember.id&&<button className="danger outline" onClick={()=>removeWithConfirmation('members',selectedMember.id,'멤버',()=>setSelectedMember(null))}>삭제</button>}</div>
    <label>이름<input value={selectedMember.name} onChange={e=>setSelectedMember({...selectedMember,name:e.target.value})}/></label><label>연락처/인스타그램<input value={selectedMember.contact} onChange={e=>setSelectedMember({...selectedMember,contact:e.target.value})}/></label><label>기수<select value={selectedMember.generation_id} onChange={e=>setSelectedMember({...selectedMember,generation_id:Number(e.target.value)})}>{generations.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
    <label className="check"><input type="checkbox" checked={selectedMember.is_active} onChange={e=>setSelectedMember({...selectedMember,is_active:e.target.checked})}/> 현재 활동 중</label><label className="check"><input type="checkbox" checked={selectedMember.published} onChange={e=>setSelectedMember({...selectedMember,published:e.target.checked})}/> 사이트에 공개</label><div className="save-row"><button disabled={busy} onClick={saveMember}>멤버 저장</button><span>공개 여부와 활동 상태는 각각 따로 관리됩니다.</span></div></>:<p className="empty">멤버를 선택하세요.</p>}</section></div>}
  </main><footer>꽃 CMS · 비공개 항목은 공개 사이트에서 표시되지 않습니다. · Google Drive 파일은 별도로 공개 공유 설정이 필요합니다.</footer>
 </div>;
}

function MemberPicker({title,hint,members,selectedIds,onChange}:{title:string;hint:string;members:Member[];selectedIds:string[];onChange:(ids:string[])=>void}){
 const [generationFilter,setGenerationFilter]=useState<'all'|number>('all');
 const generations=[...new Set(members.map(member=>member.generation_id))].sort((a,b)=>b-a);
 const visibleMembers=[...members].filter(member=>generationFilter==='all'||member.generation_id===generationFilter).sort((a,b)=>b.generation_id-a.generation_id||a.sort_order-b.sort_order);
 return <fieldset className="member-picker"><legend>{title}</legend><p className="hint">{hint}</p>{members.length? <><label className="member-filter">기수<select aria-label={`${title} 기수 필터`} value={generationFilter} onChange={event=>setGenerationFilter(event.target.value==='all'?'all':Number(event.target.value))}><option value="all">전체 기수</option>{generations.map(generation=><option key={generation} value={generation}>{generation}기</option>)}</select></label><div className="member-checks">{visibleMembers.map(member=><label key={member.id} className="check"><input type="checkbox" checked={selectedIds.includes(member.id)} onChange={event=>onChange(event.target.checked?[...selectedIds,member.id]:selectedIds.filter(id=>id!==member.id))}/>{member.generation_id}기 · {member.name}</label>)}</div></>:<p className="hint">선택할 멤버가 없습니다. 멤버 메뉴에서 먼저 등록해 주세요.</p>}</fieldset>;
}

function ListControls({item,search,visibility,onSearch,onVisibility,generations,generationFilter,onGenerationFilter}:{item:string;search:string;visibility:Visibility;onSearch:(value:string)=>void;onVisibility:(value:Visibility)=>void;generations?:Generation[];generationFilter?:'all'|number;onGenerationFilter?:(value:'all'|number)=>void}){
 return <div className={`list-controls ${generations?'has-generation-filter':''}`}><label><span className="sr-only">{item} 검색</span><input type="search" value={search} onChange={event=>onSearch(event.target.value)} placeholder={`${item} 검색`}/></label>{generations&&onGenerationFilter&&<select aria-label={`${item} 기수 필터`} value={generationFilter} onChange={event=>onGenerationFilter(event.target.value==='all'?'all':Number(event.target.value))}><option value="all">전체 기수</option>{[...generations].sort((a,b)=>b.id-a.id).map(generation=><option key={generation.id} value={generation.id}>{generation.label}</option>)}</select>}<select aria-label={`${item} 공개 상태 필터`} value={visibility} onChange={event=>onVisibility(event.target.value as Visibility)}><option value="all">전체 상태</option><option value="published">공개만</option><option value="draft">비공개만</option></select></div>;
}

function ProjectPicker({projects,selectedIds,onChange}:{projects:Project[];selectedIds:string[];onChange:(ids:string[])=>void}){
 const [generationFilter,setGenerationFilter]=useState<'all'|number>('all');
 const [search,setSearch]=useState('');
 const generations=[...new Set(projects.map(project=>project.generation_id))].sort((a,b)=>b-a);
 const visibleProjects=[...projects].filter(project=>(generationFilter==='all'||project.generation_id===generationFilter)&&(!search.trim()||project.name.toLocaleLowerCase('ko-KR').includes(search.trim().toLocaleLowerCase('ko-KR')))).sort((a,b)=>b.generation_id-a.generation_id||a.sort_order-b.sort_order);
 return <fieldset className="project-picker"><legend>연결할 프로젝트</legend><div className="project-picker-controls"><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="프로젝트 검색" aria-label="연결할 프로젝트 검색"/><select value={generationFilter} onChange={event=>setGenerationFilter(event.target.value==='all'?'all':Number(event.target.value))} aria-label="연결할 프로젝트 기수 필터"><option value="all">전체 기수</option>{generations.map(generation=><option key={generation} value={generation}>{generation}기</option>)}</select></div><div className="project-checks">{visibleProjects.map(project=><label key={project.id} className="check"><input type="checkbox" checked={selectedIds.includes(project.id)} onChange={event=>onChange(event.target.checked?[...selectedIds,project.id]:selectedIds.filter(id=>id!==project.id))}/>{project.generation_id}기 · {project.name}</label>)}{visibleProjects.length===0&&<p className="hint">조건에 맞는 프로젝트가 없어요.</p>}</div></fieldset>;
}

function VisibilityBadge({published}:{published:boolean}){
 return <span className={`visibility-badge ${published?'is-published':'is-draft'}`}>{published?'공개':'비공개'}</span>;
}

function MediaFields({title,provider,path,onChange,onUpload}:{title:string;provider:Provider|null;path:string|null;onChange:(p:Provider|null,path:string|null)=>void;onUpload?: (file:File)=>void|Promise<unknown>}){
 const [input,setInput]=useState(path||'');
 useEffect(()=>setInput(path||''),[path]);
 return <fieldset className="media-field"><legend>{title}</legend><div className="form-grid"><label>저장소<select value={provider||''} onChange={e=>onChange(e.target.value?e.target.value as Provider:null,e.target.value?input:null)}>
 <option value="">없음</option><option value="google_drive">Google Drive</option><option value="supabase">Supabase Storage 경로</option><option value="local">기존 사이트 이미지 경로</option><option value="r2">외부 HTTPS URL (R2)</option>
 </select></label><label>이미지 주소 / ID<input value={input} placeholder="파일 ID 또는 경로" onChange={e=>{setInput(e.target.value);onChange(provider,provider==='google_drive'?parseDrive(e.target.value)||e.target.value:e.target.value)}}/></label></div>
 {imageUrl(provider,path)&&<img className="media-preview" src={imageUrl(provider,path)} alt="대표 이미지 미리보기"/>}
 {onUpload?<label className="upload-zone">+ 대표 이미지 파일 업로드 (WebP로 변환)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void onUpload(file);e.target.value=''}}/></label>:<p className="hint">새 항목은 먼저 저장한 뒤 파일을 업로드할 수 있어요.</p>}
 <p className="hint">Google Drive 링크는 공유 대상이 '링크가 있는 모든 사용자'인지 확인하세요.</p>
 </fieldset>;
}
