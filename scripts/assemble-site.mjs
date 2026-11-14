// GitHub Pages용 정적 공개 사이트 + 관리자 빌드 결과물을 하나의 폴더로 모읍니다.
import { cpSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const target = join(root, '_site');
mkdirSync(target, { recursive: true });
for (const file of ['index.html', 'main.js', 'site-utils.js', 'content-adapter.js']) {
  cpSync(join(root, file), join(target, file));
}
for (const directory of ['assets','css','news','archive','flower','members','allim','contact','exhibition','admin']) {
  if (!existsSync(join(root, directory))) throw Error(`Missing website directory: ${directory}`);
  cpSync(join(root,directory), join(target,directory), { recursive: true });
}
if(existsSync(join(root,'CNAME')))cpSync(join(root,'CNAME'),join(target,'CNAME'));
writeFileSync(join(target,'.nojekyll'),'');
const url = process.env.FLOWER_SUPABASE_URL || '';
const key = process.env.FLOWER_SUPABASE_KEY || '';
if((url&&!key)||(!url&&key))throw Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or neither for JSON fallback.');
if (/secret|service_role/i.test(key)) throw Error('Never publish a secret/service_role key. Use a publishable/anon key.');
const config = `window.FLOWER_SUPABASE = ${JSON.stringify({url,anonKey:key,bucket:'flower-media'},null,2)};\n`;
writeFileSync(join(target,'supabase-config.js'),config);
console.log('Assembled website in _site with',url?'Supabase content':'legacy JSON fallback');
