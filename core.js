export const keyOf = value => String(value ?? '').normalize('NFKC').replace(/[’‘]/g,"'").replace(/[‐‑–]/g,'-').trim().replace(/\s+/g,' ').toLowerCase();
export const uid = () => crypto.randomUUID();
export const fresh = () => ({format:'puppy-vocab-backup',version:1,words:{},books:[],settings:{autoSpeak:false,voice:'',rate:0.88},session:null});
export function cleanRow(r) {
 const word=String(r.word??'').trim().slice(0,160), key=keyOf(word);
 if(!key || !/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(word) || /[<>\r\n]/.test(word) || ['__proto__','constructor','prototype'].includes(key)) return null;
 return {key,word,meaning:String(r.meaning??'').trim().slice(0,10000),english:String(r.english??'').trim().slice(0,10000),phonetic:String(r.phonetic??'').trim().slice(0,300),group:String(r.group??'').trim().slice(0,100),source:String(r.source??'').slice(0,300),note:String(r.note??'').slice(0,10000)};
}
export function mergeRows(state,rows,{target='',name='我的词书',size=20,preserve=true}={}) {
 const s=structuredClone(state);size=Math.max(1,Math.min(100,Number(size)||20));
 let book=s.books.find(b=>b.id===target);
 if(!book){book={id:uid(),name:name.trim().slice(0,100)||'我的词书',groups:[],createdAt:Date.now()};s.books.push(book);}
 const existing=new Set(book.groups.flatMap(g=>g.keys));const batch=new Map();
 const result={added:0,duplicate:0,filled:0,conflicts:0,enriched:0,invalid:0,missing:0};
 for(const raw of rows){const r=cleanRow(raw);if(!r){result.invalid++;continue;}
  let w=s.words[r.key];
  if(!w){w={key:r.key,word:r.word,meaning:'',english:'',phonetic:'',notes:[],sources:[],alternatives:[],progress:{passed:false,errors:0,seen:0,lastSeen:0}};s.words[r.key]=w;}
  for(const field of ['meaning','english','phonetic']){if(!w[field]&&r[field]){w[field]=r[field];result.filled++;}else if(field==='meaning'&&r[field]&&w[field]!==r[field]){if(!w.alternatives.includes(r[field]))w.alternatives.push(r[field]);result.conflicts++;}}
  if(r.source&&!w.sources.includes(r.source)){w.sources.push(r.source);result.enriched++;}
  if(r.note&&!w.notes.includes(r.note)){w.notes.push(r.note);result.enriched++;}
  if(existing.has(r.key)){result.duplicate++;continue;}
  existing.add(r.key);result.added++;
  const label=preserve&&r.group?r.group:'自动分组';if(!batch.has(label))batch.set(label,[]);batch.get(label).push(r.key);
 }
 const uniqueLabel=label=>{let out=label,n=1;while(book.groups.some(g=>g.label===out))out=`${label} · 追加 ${n++}`;return out;};
 for(const [label,keys] of batch){if(preserve&&label!=='自动分组')book.groups.push({id:uid(),label:uniqueLabel(label),keys});else for(let i=0;i<keys.length;i+=size)book.groups.push({id:uid(),label:uniqueLabel(`第 ${book.groups.length+1} 组`),keys:keys.slice(i,i+size)});}
 result.missing=book.groups.flatMap(g=>g.keys).filter(k=>!s.words[k].meaning).length;
 return {state:s,book,result};
}
export function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
export function choicesFor(state,key,pool){const answer=state.words[key].meaning;const meanings=[...new Set(pool.map(k=>state.words[k]?.meaning).filter(x=>x&&x!==answer))];return shuffle([answer,...shuffle(meanings).slice(0,3)]);}
export function advanceSession(state,correct,alreadyRecorded=false){
 const s=state.session;if(!s)return;
 const key=s.queue[s.index],w=state.words[key];if(!alreadyRecorded){w.progress.seen++;w.progress.lastSeen=Date.now();if(!correct){w.progress.errors++;w.progress.passed=false;}else w.progress.passed=true;}
 if(!correct&&!s.wrong.includes(key))s.wrong.push(key);
 s.previous=key;s.index++;s.revealed=false;s.feedback=null;
 if(s.index===s.queue.length){if(s.wrong.length){s.queue=shuffle(s.wrong);s.wrong=[];s.index=0;s.round++;}else{s.done=true;}}
}
export function validateBackup(s){
 if(s?.format!=='puppy-vocab-backup'||s.version!==1||!Array.isArray(s.books)||!s.words||Array.isArray(s.words))throw Error('不是小狗词书备份');
 if(Object.keys(s.words).length>100000||s.books.length>1000)throw Error('备份过大');
 const words={};for(const [k,w]of Object.entries(s.words)){const r=cleanRow({...w,word:w.word});if(!r||r.key!==k)throw Error('备份中有无效单词');words[k]={...r,notes:Array.isArray(w.notes)?w.notes.map(String):[],sources:Array.isArray(w.sources)?w.sources.map(String):[],alternatives:Array.isArray(w.alternatives)?w.alternatives.map(String):[],progress:{...w.progress,passed:w.progress?.passed===true,errors:Math.max(0,Number(w.progress?.errors)||0),seen:Math.max(0,Number(w.progress?.seen)||0),lastSeen:Number(w.progress?.lastSeen)||0}};}
 const ids=new Set();const books=s.books.map(b=>{if(typeof b.id!=='string'||ids.has(b.id)||!Array.isArray(b.groups))throw Error('词书结构不完整');ids.add(b.id);const seen=new Set(),groups=b.groups.map(g=>{if(!Array.isArray(g.keys))throw Error('分组引用无效');for(const k of g.keys){if(!words[k]||seen.has(k))throw Error('分组引用无效或重复');seen.add(k);}return {id:String(g.id),label:String(g.label),keys:g.keys};});return {id:b.id,name:String(b.name),groups,createdAt:Number(b.createdAt)||Date.now()};});
 const events=Array.isArray(s.events)?s.events.filter(e=>e&&typeof e==='object'&&words[e.key]).slice(-3000):[];
 return {...fresh(),words,books,events,settings:{...fresh().settings,...s.settings},session:null};
}
