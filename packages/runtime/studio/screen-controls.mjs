// Local runtime controls share point bindings; they never call a device write API.
export const screenControlKinds = new Set(['modeSwitch','numberStepper','trendRange']);
export function screenControlDefaults(symbol){
  if(symbol==='modeSwitch')return {options:[{label:'常规运行',value:0,values:{}},{label:'高负荷',value:1,values:{}},{label:'单机故障',value:2,values:{}}]};
  if(symbol==='numberStepper')return {min:0,max:100,step:1,precision:1};
  if(symbol==='trendRange')return {targetId:'',options:[{label:'8 h',value:28800},{label:'24 h',value:86400}],defaultSeconds:86400};
  return {};
}
export function screenDemoAllowed(doc){return doc.source?.demo===true&&['json','csv'].includes(doc.source.kind);}
export function validateScreenControl(n,doc,publishing=false){
  if(!screenControlKinds.has(n.symbol))return;
  const p=n.params;
  if(n.symbol==='numberStepper'){
    if(![p.min,p.max,p.step].every(Number.isFinite)||p.max<=p.min||p.step<=0||!Number.isInteger(p.precision)||p.precision<0||p.precision>8)throw Error('加减调节的范围、步长或小数位无效');
  }else{
    if(!Array.isArray(p.options)||!p.options.length||p.options.length>12||new Set(p.options.map(o=>o.value)).size!==p.options.length||p.options.some(o=>!o.label?.trim()||!Number.isFinite(o.value)))throw Error('切换选项的名称或数值无效');
    if(n.symbol==='trendRange'){
      if(p.options.some(o=>o.value<=0||o.value>604800)||!p.options.some(o=>o.value===p.defaultSeconds))throw Error('趋势时间范围无效');
      if((publishing||p.targetId)&&!doc.nodes.some(t=>t.id===p.targetId&&t.symbol==='trend'))throw Error('请选择本画面的目标趋势图');
    }else{
      const slots=n.dataSlots||[{key:'value',kinds:['number']}];
      for(const o of p.options)for(const [key,value] of Object.entries(o.values||{})){
        const s=slots.find(s=>s.key===key);if(!s||key==='value'||!(s.kinds.includes('boolean')?typeof value==='boolean':typeof value==='number'&&Number.isFinite(value)))throw Error('工况联动值与测点类型不匹配');
      }
    }
  }
}
export function screenControlTransition(doc,points,request){
  const n=doc.nodes.find(n=>n.id===request.id);if(!n||!screenControlKinds.has(n.symbol))throw Error('交互组件不存在');
  validateScreenControl(n,doc,true);
  if(n.symbol==='trendRange'){
    if(!n.params.options.some(o=>o.value===request.value))throw Error('时间档位不存在');
    return {window:{id:n.params.targetId,seconds:request.value}};
  }
  if(!screenDemoAllowed(doc))throw Error('仅本地演示数据可调节；当前连接保持只读');
  const updates={};
  const put=(slot,value)=>{const id=n.bindings[slot],point=points[id];if(!id)throw Error('请先绑定'+slot);if(point?.quality!=='good')throw Error('测点质量无效，无法演示调节');
    if(typeof point.value!==typeof value)throw Error('测点类型不匹配');updates[id]=value;};
  if(n.symbol==='numberStepper'){
    if(![-1,1].includes(request.delta))throw Error('调节方向无效');
    const value=points[n.bindings.value]?.value;if(typeof value!=='number'||!Number.isFinite(value))throw Error('未取得有效数值');
    put('value',Number(Math.max(n.params.min,Math.min(n.params.max,value+n.params.step*request.delta)).toFixed(n.params.precision)));
  }else{
    const o=n.params.options.find(o=>o.value===request.value);if(!o)throw Error('工况不存在');
    put('value',o.value);for(const [slot,value] of Object.entries(o.values||{}))put(slot,value);
  }
  return {updates};
}
export function projectScreenControl(n,entry,props,dispatch){
  const point=props.points[n.bindings.value],p=n.params,range=n.symbol==='trendRange';
  const value=range?(props.windows[n.params.targetId]??p.defaultSeconds):(point?.quality==='good'?point.value:null);
  const disabled=props.editing||(!range&&(!screenDemoAllowed(props.doc)||point?.quality!=='good'));
  entry.heading.style.display=p.hideLabel?'none':'';
  const key=JSON.stringify([p,value,disabled,props.controlError?.[n.id],n.title]);if(entry.controlKey===key)return;entry.controlKey=key;
  const focus=entry.host.contains(document.activeElement)?document.activeElement.dataset.controlKey:null;
  entry.card.classList.add('screen-runtime-control');entry.card.dataset.kind=n.symbol;entry.card.setAttribute('aria-label',n.title);entry.heading.textContent=n.title;entry.heading.style.display=p.hideLabel?'none':'';
  entry.host.replaceChildren();
  const button=(label,key,request)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.dataset.controlKey=key;b.setAttribute('aria-label',n.title+' · '+label);b.onclick=e=>{e.stopPropagation();dispatch({...request,id:n.id});};entry.host.append(b);return b;};
  if(n.symbol==='numberStepper'){
    const minus=button('−','minus',{delta:-1});minus.disabled=disabled||value<=p.min;
    const output=document.createElement('output');output.textContent=typeof value==='number'?value.toFixed(p.precision):'—';output.setAttribute('aria-live','polite');entry.host.append(output);
    const plus=button('+','plus',{delta:1});plus.disabled=disabled||value>=p.max;
  }else for(const o of p.options){const b=button(o.label,String(o.value),{value:o.value});b.setAttribute('aria-pressed',String(value===o.value));}
  entry.quality.textContent=props.controlError?.[n.id]||(!range?(screenDemoAllowed(props.doc)?'本地演示 · 不写现场':'当前数据连接只读'):'');
  entry.quality.setAttribute('role',props.controlError?.[n.id]?'alert':'status');entry.quality.style.display=p.hideLabel&&!props.controlError?.[n.id]?'none':'';
  if(focus) [...entry.host.querySelectorAll('button')].find(b=>b.dataset.controlKey===focus)?.focus({preventScroll:true});
}

export function screenControlProblem(n,doc){try{validateScreenControl(n,doc,true);return '';}catch(error){return error.message;}}
