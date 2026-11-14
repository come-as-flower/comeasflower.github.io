// GitHub Pages 배포 시에는 scripts/assemble-site.mjs가 Actions Variables로 이 파일을 생성합니다.
// 로컬 정적 사이트에서 Supabase를 사용하려면 publishable/anon 키만 입력하세요.
// service_role 또는 secret 키는 절대 브라우저·저장소에 넣지 마세요.
window.FLOWER_SUPABASE = {
  url: '',
  anonKey: '',
  bucket: 'flower-media',
};
