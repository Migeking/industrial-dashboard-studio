import { randomUUID } from "node:crypto";
import { screenPageView } from "./screen-pages.mjs";
import { screenRevision, executeScreenCommands } from "./screen-commands.mjs";
import { screenSymbols, screenPorts, screenSlots, screenAppearanceOptions } from "../../components/studio/screen-symbols.mjs";
import { waterEquipment } from '../../components/studio/water-equipment.mjs';

// A small graph vocabulary for models. All mutations still pass the command executor.
export function compileScreenIntent(project,pageId,intent,allowedPoints=[]) {
  if(!intent||!Array.isArray(intent.nodes)||!Array.isArray(intent.links)||intent.nodes.length>80||intent.links.length>100)throw Error("设计必须包含 nodes 和 links 数组（最多 80 个图元、100 条管道）");
  const doc=screenPageView(project,pageId),operations=[],refs=new Map(),ports=new Map(),targets=new Map();
  for(const n of doc.nodes){refs.set(n.id,n.id);ports.set(n.id,screenPorts(n));targets.set(n.id,n);}
  // People and models use equipment names/tags; only expose unambiguous aliases.
  const aliases=new Map();
  for(const n of doc.nodes)for(const key of new Set([n.title,n.title.match(/^[A-Za-z][A-Za-z0-9_.-]*/)?.[0]].filter(Boolean))){
    aliases.set(key,aliases.has(key)?null:n.id);
  }
  for(const [key,id] of aliases)if(id&&!refs.has(key))refs.set(key,id);
  const keys=new Set(),bindingErrors=[];
  const bindings=(id,target,values={})=>{
    for(const key of Object.keys(values))if(values[key]!=null&&values[key]!==""&&!screenSlots(target).some(s=>s.key===key))bindingErrors.push(`${target.title} 不支持槽位 ${key}，仅可用 ${screenSlots(target).map(s=>s.key).join('/')}`);
    for(const slot of screenSlots(target)){
      const point=values[slot.key];
      const tag=target.title?.match(/^[A-Za-z][A-Za-z0-9_-]*/)?.[0];
      if(point&&slot.kinds.includes(doc.mappings.find(m=>m.id===point)?.kind)&&tag&&doc.mappings.some(m=>m.id.startsWith(tag+"."))&&!point.startsWith(tag+"."))throw Error(`${target.title} 的测点归属不一致：${point}；本图元已有 ${tag}. 分组，请从该组选择，跨设备绑定请在属性面板明确设置`);
      if(target.bindings?.[slot.key] && (point==null||point===target.bindings[slot.key]))continue;
      if(point!==undefined || slot.required)operations.push({op:"bindSlot",id,slot:slot.key,pointId:point||null});
    }
  };
  for(const raw of intent.nodes){
    const n={...raw};
    if(!n||typeof n.key!=="string"||!n.key||keys.has(n.key))throw Error("图元 key 必须唯一");keys.add(n.key);
    const known=doc.nodes.find(x=>x.id===(refs.get(n.key)||n.key));
    n.symbol??=known?.symbol;n.title??=known?.title;
    if(!Object.hasOwn(screenSymbols,n.symbol)||typeof n.title!=="string"||!n.title.trim())throw Error("图元 symbol 或 title 无效");
    const matches=doc.nodes.filter(x=>x.id===(refs.get(n.key)||n.key)||x.title===n.title&&x.symbol===n.symbol);
    if(matches.length>1)throw Error("同名图元不唯一："+n.title);
    const existing=matches[0],id=existing?.id||"ai-"+n.key;
    if(existing&&existing.symbol!==n.symbol)throw Error("已有设备图元类型不一致："+existing.title);
    if(!existing){
      const op={op:"addNode",tempId:id,symbol:n.symbol,title:n.title,x:n.x,y:n.y};
      for(const k of ["w","h","params"])if(n[k]!==undefined)op[k]=n[k];
      if(n.symbol==="text")op.text=n.text||n.title;
      operations.push(op);
      if(screenAppearanceOptions(n.symbol).depth)operations.push({op:"setAppearance",id,appearance:"depth"});
    } else if(n.move===true)operations.push({op:"moveNode",id,x:n.x,y:n.y});
    const target=existing||{symbol:n.symbol,type:"screen-node",title:n.title,params:n.params||{},bindings:{}};
    refs.set(n.key,id);ports.set(id,screenPorts(target));targets.set(id,target);
    bindings(id,target,n.bindings);
  }
  const port=(id,name)=>{
    if(!ports.has(id))throw Error("连接对象不存在："+id);
    if(ports.get(id).some(p=>p.id===name))return;
    const xy={left:[0,50],right:[100,50],top:[50,0],bottom:[50,100]}[name];
    if(!xy)throw Error("连接点不存在："+name);
    const p={id:name,label:name,x:xy[0],y:xy[1],direction:"both"};
    ports.set(id,[...ports.get(id),p]);operations.push({op:"addPort",id,port:p});
  };
  for(let i=0;i<intent.links.length;i++){
    const l=intent.links[i],from=refs.get(l.from),to=refs.get(l.to);
    if(!from||!to)throw Error(`管道 ${i+1} 引用了未定义或重名图元：${l.from} → ${l.to}；请使用上下文中已有的 key 或唯一设备名称/位号`);
    const fp=l.fromPort||"right",tp=l.toPort||"left";port(from,fp);port(to,tp);
    const old=doc.pipes.find(p=>p.source.nodeId===from&&p.source.portId===fp&&p.target.nodeId===to&&p.target.portId===tp);
    const id=old?.id||"ai-link-"+i;
    if(!old)operations.push({op:"connect",tempId:id,title:l.title||"工艺管道",source:{nodeId:from,portId:fp},target:{nodeId:to,portId:tp},...(l.vertices?{vertices:l.vertices}:{})});
    bindings(id,old||{type:"pipe",title:l.title,bindings:{}},l.bindings);
  }
  if(bindingErrors.length)throw Error(bindingErrors.join("；"));
  if(!operations.length)return null;
  const proposal={id:randomUUID(),pageId,baseRevision:screenRevision(project),operations};
  executeScreenCommands(project,proposal,allowedPoints);
  return proposal;
}

export function screenModelContext(project,pageId,allowedPoints) {
  const doc=screenPageView(project,pageId),tags=doc.nodes.map(n=>n.title.match(/^[A-Za-z][A-Za-z0-9_.-]*/)?.[0]);
  const names=new Map(doc.nodes.map((n,i)=>[n.id,tags[i]&&tags.filter(t=>t===tags[i]).length===1?tags[i]:doc.nodes.filter(x=>x.title===n.title).length===1?n.title:n.id]));
  const components=Object.entries(waterEquipment).map(([symbol,d])=>({symbol,label:d.label,w:d.w,h:d.h,description:d.description,ports:d.portDefinitions.map(p=>({id:p.id,label:p.label,direction:p.direction})),slots:d.slots.map(s=>({key:s.key,label:s.label,kinds:s.kinds,required:s.required}))}));
  return {canvas:{width:1920,height:1080},components,nodes:doc.nodes.map(n=>({key:names.get(n.id),symbol:n.symbol,title:n.title,x:n.x,y:n.y,w:n.w,h:n.h,locked:n.locked,params:{unit:n.params?.unit},bindings:n.bindings,slots:screenSlots(n).map(s=>({key:s.key,kinds:s.kinds,required:s.required})),ports:screenPorts(n).map(p=>p.id)})),links:doc.pipes.map(p=>({from:names.get(p.source.nodeId),fromPort:p.source.portId,to:names.get(p.target.nodeId),toPort:p.target.portId,title:p.title,bindings:p.bindings})),points:doc.mappings.filter(m=>allowedPoints.includes(m.id)).map(m=>({id:m.id,label:m.label,kind:m.kind,unit:m.unit}))};
}
