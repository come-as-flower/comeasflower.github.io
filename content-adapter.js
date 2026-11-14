// 기존 공개 페이지 레이아웃을 유지하면서 Supabase 자료를 원래 JSON 모양으로 변환합니다.
// config 미설정일 때만 기존 JSON을 사용합니다. 설정 이후 API 오류는 숨기지 않습니다.
window.FlowerContent = (() => {
  const conf = window.FLOWER_SUPABASE || {};
  const enabled = !!(conf.url && conf.anonKey);
  const base = (conf.url || '').replace(/\/$/, '');
  const safeImagePath = (value) => encodeURIComponent(value).replaceAll('%2F', '/');

  async function list(table, ordered = true) {
    const all = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const order = ordered ? '&order=sort_order.asc' : '';
      const url = `${base}/rest/v1/${table}?select=*${order}&offset=${offset}&limit=${pageSize}`;
      // 새로운 sb_publishable 키는 JWT가 아니므로 Authorization Bearer에 넣지 않습니다.
      const headers = { apikey: conf.anonKey };
      if (conf.anonKey.split('.').length === 3) headers.Authorization = `Bearer ${conf.anonKey}`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Supabase ${table}: HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('예상치 못한 Supabase 응답');
      all.push(...rows);
      if (rows.length < pageSize) break;
    }
    return all;
  }

  function imageURL(provider, path) {
    if (!path) return '';
    if (provider === 'google_drive') return `https://drive.google.com/thumbnail?id=${encodeURIComponent(path)}&sz=w1600`;
    if (provider === 'supabase') return `${base}/storage/v1/object/public/${conf.bucket || 'flower-media'}/${safeImagePath(path)}`;
    if (provider === 'r2') return /^https:\/\//.test(path) ? path : '';
    if (provider === 'local') return path;
    return '';
  }

  async function fetchProjects() {
    if (!enabled) return FlowerSite.fetchJSON('../assets/json/project.json');
    const [projects, works, images, projectMembers, workMembers, members] = await Promise.all([
      list('projects'),list('works'),list('work_images'),list('project_members',false),list('work_members',false),list('members')
    ]);
    const memberName = new Map(members.map(member=>[member.id,member.name]));
    const namesByWork = new Map();
    for(const link of workMembers) {
      if(!namesByWork.has(link.work_id)) namesByWork.set(link.work_id, []);
      const name=memberName.get(link.member_id);
      if(name) namesByWork.get(link.work_id).push(name);
    }
    const namesByProject = new Map();
    for(const link of projectMembers) {
      if(!namesByProject.has(link.project_id)) namesByProject.set(link.project_id, []);
      const name=memberName.get(link.member_id);
      if(name) namesByProject.get(link.project_id).push(name);
    }
    const imageMap = new Map();
    for(const item of images) {
      if(!imageMap.has(item.work_id)) imageMap.set(item.work_id, []);
      const url=imageURL(item.provider,item.path);
      if(url) imageMap.get(item.work_id).push(url);
    }
    const workMap = new Map();
    for(const work of works) {
      if(!workMap.has(work.project_id)) workMap.set(work.project_id, []);
      const urls=imageMap.get(work.id)||[];
      workMap.get(work.project_id).push({creator:(namesByWork.get(work.id)||[]).join(', ')||work.creator||'',title:work.title,description:work.description,images:urls});
    }
    const grouped={};
    for (const p of projects) {
      const key=`${p.generation_id}.0projects`;
      if(!grouped[key]) grouped[key]=[];
      grouped[key].push({id:p.legacy_id||p.id,name:p.name,description:p.description,
        duration:p.duration_text,output:p.project_type||p.output||'',participants:namesByProject.get(p.id)||[],
        works:workMap.get(p.id)||[]});
    }
    return grouped;
  }

  async function fetchExhibitions() {
    if (!enabled) return FlowerSite.fetchJSON('../assets/json/exhibitions.json');
    const [rows, images, exhibitionMembers, members] = await Promise.all([
      list('exhibitions'), list('exhibition_images'), list('exhibition_members',false), list('members')
    ]);
    const memberName = new Map(members.map(member=>[member.id,member.name]));
    const namesByExhibition = new Map();
    for(const link of exhibitionMembers) {
      if(!namesByExhibition.has(link.exhibition_id)) namesByExhibition.set(link.exhibition_id, []);
      const name=memberName.get(link.member_id);
      if(name) namesByExhibition.get(link.exhibition_id).push(name);
    }
    const byExhibition = new Map();
    for(const image of images) {
      if(!byExhibition.has(image.exhibition_id)) byExhibition.set(image.exhibition_id, []);
      const resolved=imageURL(image.provider,image.path);
      if(resolved) byExhibition.get(image.exhibition_id).push({url:resolved,alt:image.alt_text || ''});
    }
    return {exhibitions:rows.map(e=>({id:e.legacy_id||e.id,title:e.title,description:e.description||[],
      duration:e.duration_text,place:e.place,participants:namesByExhibition.get(e.id)||e.participants||[],
      image:imageURL(e.cover_provider,e.cover_path),images:byExhibition.get(e.id)||[]}))};
  }

  async function fetchNotices() {
    if (!enabled) return FlowerSite.fetchJSON('../assets/json/allim.json');
    return (await list('notices')).map(n=>({title:n.title,date:n.date_text,contents:n.contents||[]}));
  }

  async function fetchMembers() {
    if (!enabled) return FlowerSite.fetchJSON('../assets/json/members.json');
    const rows=await list('members');
    const result={active:{},past:{}};
    for(const m of rows) {
      const section=m.is_active?'active':'past',key=`${m.generation_id}.0`;
      if(!result[section][key]) result[section][key]=[];
      result[section][key].push({name:m.name,contact:m.contact});
    }
    return result;
  }
  return {enabled, imageURL, fetchProjects, fetchExhibitions, fetchNotices, fetchMembers};
})();
