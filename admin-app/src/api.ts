import { createClient } from '@supabase/supabase-js';
declare global { interface Window { FLOWER_SUPABASE?: { url: string; anonKey: string; bucket?: string } } }
const cfg=window.FLOWER_SUPABASE;
const url=(cfg?.url || import.meta.env.VITE_SUPABASE_URL || '').trim();
const key=(cfg?.anonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const ready=!!(url && key);
export const bucket=cfg?.bucket || 'flower-media';
export const db=createClient(url || 'https://invalid.supabase.co',key || 'missing-public-key',{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
export type Provider='local'|'google_drive'|'supabase'|'r2';
export interface Project {id:string;legacy_id:string|null;generation_id:number;name:string;description:string;duration_text:string;project_type:string;sort_order:number;published:boolean}
export interface Work {id:string;project_id:string;title:string;description:string;sort_order:number;published:boolean}
export interface WorkImage {id:string;work_id:string;provider:Provider;path:string;alt_text:string;sort_order:number}
export interface Exhibition {id:string;legacy_id:string|null;title:string;description:string[];duration_text:string;place:string;cover_provider:Provider|null;cover_path:string|null;sort_order:number;published:boolean}
export interface ExhibitionImage {id:string;exhibition_id:string;provider:Provider;path:string;alt_text:string;sort_order:number}
export interface Notice {id:string;title:string;date_text:string;contents:string[];sort_order:number;published:boolean}
export interface Member {id:string;generation_id:number;name:string;contact:string;is_active:boolean;sort_order:number;published:boolean}
export interface Generation {id:number;label:string;started_year:number|null;activity_years:number;sort_order:number}
export interface ProjectMember {project_id:string;member_id:string}
export interface WorkMember {work_id:string;member_id:string}
export interface ExhibitionMember {exhibition_id:string;member_id:string}
export function imageUrl(provider:Provider|null,path:string|null){
 if(!provider||!path)return '';
 if(provider==='google_drive')return `https://drive.google.com/thumbnail?id=${encodeURIComponent(path)}&sz=w900`;
 if(provider==='supabase')return `${url}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
 if(provider==='r2')return path.startsWith('https://')?path:'';
 return `../${path.replace(/^(?:\.\.\/|\.\/|\/)+/,'')}`;
}
export function parseDrive(value:string){
 const raw=value.trim();
 const m=raw.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|[?&]id=)([a-zA-Z0-9_-]{15,})/);
 const id=m?.[1]||(/^[a-zA-Z0-9_-]{15,}$/.test(raw)?raw:null);
 return id;
}
export function message(error:unknown){
 if(error instanceof Error)return error.message;
 if(typeof error==='string')return error;
 if(error&&typeof error==='object'){
  const value=error as {message?:unknown;details?:unknown;hint?:unknown;code?:unknown};
  const parts=[value.message,value.details,value.hint,value.code]
   .filter((part):part is string=>typeof part==='string'&&part.trim().length>0);
  if(parts.length)return parts.join(' · ');
 }
 return '알 수 없는 오류가 발생했어요.';
}
export async function query<T>(table:string):Promise<T[]>{
 const result=await db.from(table).select('*').order('sort_order',{ascending:true}).limit(1000);
 if(result.error)throw Error(`${table} 조회 실패: ${message(result.error)}`);
 return (result.data||[]) as T[];
}
export async function save(table:string,values:Record<string,unknown>,id?:string){
 const result=id?await db.from(table).update(values).eq('id',id):await db.from(table).insert(values).select('id').single();
 if(result.error)throw result.error;
 return id||result.data?.id as string;
}
export async function remove(table:string,id:string){const result=await db.from(table).delete().eq('id',id);if(result.error)throw result.error;}
export async function upload(file:File,resourceId:string,folder='works'):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG, PNG, WebP만 업로드할 수 있어요.');
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
 const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
 const ctx=c.getContext('2d');if(!ctx)throw Error('이미지 변환을 사용할 수 없습니다.');
 ctx.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
 const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('이미지 압축 실패')),'image/webp',0.82));
 if(blob.size>10*1024*1024)throw Error('이미지 압축 후 용량이 10MB를 초과했어요.');
 const path=`${folder}/${resourceId}/${crypto.randomUUID()}.webp`;
 const result=await db.storage.from(bucket).upload(path,blob,{cacheControl:'3600',contentType:'image/webp',upsert:false});
 if(result.error)throw result.error;
 return path;
}
