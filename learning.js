import {keyOf,shuffle,uid} from './core.js';
export const MODES={cards:'看词学习', 'en-cn':'看单词选意思','cn-en':'看意思选单词',mixed:'双向随机选择',recall:'主动回忆卡',spelling:'看意思拼单词'};
const DAY=86400000,INTERVALS=[1,3,7,14,30,60];
export function normalizeProgress(p={}){
 return {...p,passed:p.passed===true,errors:Math.max(0,Number(p.errors)||0),seen:Math.max(0,Number(p.seen)||0),lastSeen:Number(p.lastSeen)||0,attempts:Math.max(0,Number(p.attempts)||((p.passed||p.errors>0)?1:0)),correct:Math.max(0,Number(p.correct)||0),streak:Math.max(0,Number(p.streak)||0),unresolved:typeof p.unresolved==='boolean'?p.unresolved:(Number(p.errors)>0&&!p.passed),dueAt:Math.max(0,Number(p.dueAt)||0),reviewStep:Math.max(0,Math.min(6,Number(p.reviewStep)||0)),lastScheduledAt:Number(p.lastScheduledAt)||0,lastWrong:Number(p.lastWrong)||0,hints:Math.max(0,Number(p.hints)||0),byMode:p.byMode&&typeof p.byMode==='object'?p.byMode:{},lastOptions:p.lastOptions&&typeof p.lastOptions==='object'?p.lastOptions:{}};
}
export function upgradeLearning(state){
 const current=state.learningVersion===2;state.learningVersion=2;
 for(const w of Object.values(state.words))w.progress=normalizeProgress(w.progress);
 state.events=Array.isArray(state.events)?state.events.slice(-3000):[];
 state.settings={choiceCount:4,...state.settings};
 const s=state.session;
 if(s){s.mode=({learn:'cards',quiz:'en-cn',review:'en-cn'})[s.mode]||s.mode;s.testMode=s.testMode||'mixed';s.initialKeys=s.initialKeys||[...s.queue];s.stats=s.stats||{correct:0,wrong:0,hinted:0};if(!current)s.question=null;s.choices=null;s.hinted=s.hinted||false;}
 return state;
}
export function reviewKeys(state,keys,kind,now=Date.now()){
 const unique=[...new Set(keys)].filter(k=>state.words[k]?.meaning);
 if(kind==='due')return unique.filter(k=>state.words[k].progress.attempts>0&&state.words[k].progress.dueAt<=now).sort((a,b)=>state.words[a].progress.dueAt-state.words[b].progress.dueAt);
 if(kind==='unresolved')return unique.filter(k=>state.words[k].progress.unresolved).sort((a,b)=>state.words[b].progress.errors-state.words[a].progress.errors||state.words[b].progress.lastWrong-state.words[a].progress.lastWrong);
 if(kind==='errors')return unique.filter(k=>state.words[k].progress.errors>0).sort((a,b)=>state.words[b].progress.errors-state.words[a].progress.errors);
 if(kind==='passed')return unique.filter(k=>state.words[k].progress.passed);
 if(kind==='new')return unique.filter(k=>state.words[k].progress.attempts===0);
 return unique;
}
export function makeQuestion(state,key,keys,direction='en-cn',count=4){
 const w=state.words[key];if(!w?.meaning)return null;
 const answer=direction==='cn-en'?w.word:w.meaning,prompt=direction==='cn-en'?w.meaning:w.word;
 const labels=new Map();
 for(const k of keys){const other=state.words[k];if(!other?.meaning||k===key)continue;
  // Equivalent definitions must not become competing answers to the same prompt.
  if(direction==='cn-en'&&keyOf(other.meaning)===keyOf(w.meaning))continue;
  const label=direction==='cn-en'?other.word:other.meaning;
  if(keyOf(label)!==keyOf(answer)&&!labels.has(keyOf(label)))labels.set(keyOf(label),label);
 }
 const candidates=[...labels.values()],n=Math.max(2,Math.min(6,Number(count)||4)),take=Math.min(n-1,candidates.length),previous=w.progress.lastOptions?.[direction]||[];
 let distractors=shuffle(candidates).slice(0,take);
 const sameSet=a=>a.length===previous.length&&a.every(x=>previous.includes(x));
 if(sameSet([answer,...distractors])&&candidates.length>take){const fresh=candidates.find(x=>!previous.includes(x));if(fresh)distractors[take-1]=fresh;}
 let options=shuffle([answer,...distractors]);
 if(options.length>1&&JSON.stringify(options)===JSON.stringify(previous))options=[...options.slice(1),options[0]];
 return {key,direction,prompt,answer,options,usable:options.length>=2};
}
export function rememberQuestion(state,q){if(q)state.words[q.key].progress.lastOptions[q.direction]=[...q.options];}
export function recordAttempt(state,key,{success,mode='en-cn',chosen='',hinted=false,grade='good',book='',group=-1,prompt='',answer='',now=Date.now()}={}){
 const w=state.words[key],p=w.progress=normalizeProgress(w.progress);p.attempts++;p.seen++;p.lastSeen=now;
 const stat=p.byMode[mode]||{attempts:0,errors:0};stat.attempts++;p.byMode[mode]=stat;
 if(!success){p.errors++;stat.errors++;p.passed=false;p.streak=0;p.unresolved=true;p.lastWrong=now;p.reviewStep=0;p.dueAt=now+600000;p.lastScheduledAt=now;}
 else if(hinted){p.hints++;p.streak=0;p.dueAt=p.dueAt>now?Math.min(p.dueAt,now+600000):now+600000;}
 else{p.correct++;p.passed=true;p.streak++;if(p.streak>=2)p.unresolved=false;
  // Repeated immediate retries do not move a word through several review intervals.
  if(!p.dueAt||p.dueAt<=now){let step=p.reviewStep;if(grade==='hard')step=0;if(grade==='easy')step=Math.min(step+1,INTERVALS.length-1);p.dueAt=now+INTERVALS[Math.min(step,INTERVALS.length-1)]*DAY;p.reviewStep=Math.min(step+1,INTERVALS.length-1);p.lastScheduledAt=now;}
 }
 const entry={id:uid(),at:now,key,book,group,mode,success:success===true,hinted:hinted===true,grade,prompt:prompt||w.word,chosen:String(chosen??'').slice(0,10000),answer:answer||w.meaning};
 state.events=(state.events||[]).concat(entry).slice(-3000);
 if(state.session){const s=state.session;s.stats=s.stats||{correct:0,wrong:0,hinted:0};s.stats[!success?'wrong':hinted?'hinted':'correct']++;}
 return entry;
}
export function advanceRecorded(state,correct){
 const s=state.session;if(!s||s.done)return;
 const key=s.queue[s.index];if(!correct&&!s.wrong.includes(key))s.wrong.push(key);
 s.previous=key;s.index++;s.revealed=false;s.feedback=null;s.question=null;s.hinted=false;
 if(s.index===s.queue.length){if(s.wrong.length){s.queue=shuffle(s.wrong);s.wrong=[];s.index=0;s.round++;}else s.done=true;}
}
export function spellingCorrect(value,word){return keyOf(value)===keyOf(word);}
