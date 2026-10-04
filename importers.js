import {keyOf} from './core.js';
export function parseDelimited(text,delimiter){
 text=text.replace(/^\uFEFF/,'');if(!delimiter)delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';
 let rows=[],row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else if(!quote&&!cell||quote)quote=!quote;else cell+=c;}else if(c===delimiter&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quote)throw Error('CSV 引号不完整');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
const xml = s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('Excel XML 无效');return d;};
const nodes=(d,name)=>[...d.getElementsByTagNameNS('*',name)];
export async function readXlsx(buffer){
 const zip=await JSZip.loadAsync(buffer);const total=Object.values(zip.files).reduce((sum,f)=>sum+(f._data?.uncompressedSize||0),0);if(total>100*1024*1024)throw Error('Excel 解压后超过 100 MB');
 const read=async p=>{if(!zip.file(p))throw Error(`Excel 缺少 ${p}`);return xml(await zip.file(p).async('string'));};
 const shared=zip.file('xl/sharedStrings.xml')?nodes(await read('xl/sharedStrings.xml'),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
 const wb=await read('xl/workbook.xml'),rels=nodes(await read('xl/_rels/workbook.xml.rels'),'Relationship');const out=[];
 for(const sheet of nodes(wb,'sheet')){const rel=rels.find(r=>r.getAttribute('Id')===sheet.getAttribute('r:id'));if(!rel||rel.getAttribute('TargetMode')==='External')continue;
 const target=rel.getAttribute('Target'),path=target.startsWith('/')?target.slice(1):new URL(target,'https://excel.local/xl/').pathname.slice(1);const d=await read(path);const rows=[];
 for(const row of nodes(d,'row')){const cells=[];for(const c of nodes(row,'c')){const ref=c.getAttribute('r')||'A1';let col=0;for(const ch of ref.replace(/\d/g,''))col=col*26+ch.charCodeAt(0)-64;if(col>1000)throw Error('Excel 列数过多');const t=c.getAttribute('t');const v=nodes(c,'v')[0]?.textContent||'';cells[col-1]=t==='s'?(shared[Number(v)]||''):t==='inlineStr'?nodes(c,'t').map(t=>t.textContent).join(''):v;}if(cells.some(x=>String(x).trim()))rows.push(cells);if(rows.length>100001)throw Error('Excel 超过十万行');}out.push({name:sheet.getAttribute('name'),rows});}
 return out;
}
export const aliases={word:['word','单词','词汇','英文','headword'],meaning:['meaning','中文','中文释义','释义','translation','chinese','cn'],english:['english','英文释义','definition','en'],phonetic:['phonetic','音标','uk','us','phonetics'],group:['group','组号','分组','list','unit','组'],note:['note','备注','笔记'],source:['source','来源']};
export function guessColumns(header){const out={};for(const [field,names]of Object.entries(aliases)){out[field]=header.findIndex(h=>names.includes(String(h).trim().toLowerCase()));}return out;}
export function readerRows(data,{bold=false}={}){
 if(data.format!=='puppy-reader-backup'||data.version!==1||!Array.isArray(data.items))throw Error('不支持的阅读器备份');const rows=[];
 for(const item of data.items){const saved=item.study?.words||{},selected=new Set(Object.keys(saved).filter(k=>saved[k]?.marked));
 const doc=new DOMParser().parseFromString(String(item.doc?.html||''),'text/html');doc.querySelectorAll('script,style,code,pre').forEach(n=>n.remove());
 if(bold){const containers=[...doc.querySelectorAll('strong,b')],processed=new Set();for(const el of containers){if(processed.has(el)||el.parentElement.closest('strong,b'))continue;const group=[el];let n=el.nextSibling;while(n){if(n.nodeType===3&&!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(n.textContent)){n=n.nextSibling;continue;}if(n.nodeType===1&&n.matches('strong,b')){group.push(n);n=n.nextSibling;continue;}break;}group.forEach(n=>processed.add(n));const tokens=group.map(n=>n.textContent).join(' ').match(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’\-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g)||[];if(tokens.length===1||item.study?.includePhraseBold)for(const t of tokens){const k=keyOf(t);if(saved[k]?.boldIncluded!==false)selected.add(k);}}}
 const tokens=[];const walk=node=>{if(node.nodeType===3)tokens.push(...(node.textContent.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’\-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g)||[]));else for(const child of node.childNodes)walk(child);};walk(doc.body);const ordered=[...new Set([...tokens.map(keyOf).filter(k=>selected.has(k)),...selected])];
 for(const k of ordered){const r=saved[k]||{};rows.push({word:k,meaning:'',note:r.note||'',source:item.doc?.name||'小狗阅读器'});}}
 return rows;
}
