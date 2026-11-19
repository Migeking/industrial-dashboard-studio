import { screenNode, validateScreen } from "./screen-model.mjs";
import { screenPageView, screenPages } from "./screen-pages.mjs";
import { screenSymbols, screenPorts, screenSlots, screenAppearanceOptions } from "../../components/studio/screen-symbols.mjs";
import { applyScreenNodeDefaults } from "./screen-themes.mjs";

export function screenRevision(project) {
  const text=JSON.stringify(project);
  let hash=14695981039346656037n;
  for(let i=0;i<text.length;i++) hash=BigInt.asUintN(64,(hash^BigInt(text.charCodeAt(i)))*1099511628211n);
  return `${text.length}:${hash.toString(16)}`;
}
function commandKeys(value, allowed) {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k)))
    throw Error("命令包含不支持的字段");
}
function commandNumber(value) { if(typeof value!=="number" || !Number.isFinite(value)) throw Error("坐标和尺寸必须是有限数值"); return value; }

// Never mutates the input. Call again against the current revision before applying.
export function executeScreenCommands(project, proposal, allowedPoints=[], makeId=()=>crypto.randomUUID()) {
  commandKeys(proposal,["id","pageId","baseRevision","operations"]);
  if(proposal.baseRevision!==screenRevision(project)) throw Error("画面已变化，请重新生成预演");
  if(!screenPages(project).some(p=>p.id===proposal.pageId)) throw Error("目标画面不存在");
  if(typeof proposal.id!=="string" || !proposal.id || !Array.isArray(proposal.operations) || proposal.operations.length>300 || !proposal.operations.length)
    throw Error("命令批次无效（每批 1～300 项）");
  const result=JSON.parse(JSON.stringify(project)),doc=screenPageView(result,proposal.pageId),refs=new Map(),changes=[],pending=[];
  const allIds=new Set(screenPages(project).flatMap(p=>[...p.nodes,...p.pipes].map(n=>n.id)));
  const fresh=(key)=>{if(typeof key!=="string" || !key || refs.has(key) || allIds.has(key))throw Error("临时编号重复或无效");const id=makeId();if(typeof id!=="string"||!id||allIds.has(id))throw Error("对象编号重复");allIds.add(id);refs.set(key,id);return id;};
  const resolve=id=>refs.get(id)||id;
  const item=(id)=>{const n=[...doc.nodes,...doc.pipes].find(n=>n.id===resolve(id));if(!n)throw Error("对象不存在或属于其他画面："+id);if(n.locked)throw Error("对象已锁定："+n.title);return n;};
  for(const op of proposal.operations) {
    let n;
    switch(op.op) {
      case "addNode": {
        commandKeys(op,["op","tempId","symbol","title","x","y","w","h","params","text"]);
        if(!Object.hasOwn(screenSymbols,op.symbol))throw Error("未知图元");
        n=screenNode(op.symbol,fresh(op.tempId),commandNumber(op.x),commandNumber(op.y),doc.nodes);
        n.x=op.x;n.y=op.y;
        if(op.title!==undefined)n.title=op.title;
        if(op.text!==undefined){if(op.symbol!=="text"||typeof op.text!=="string")throw Error("文字内容仅适用于文字图元");n.text=op.text;}
        for(const k of ["w","h"])if(op[k]!==undefined)n[k]=commandNumber(op[k]);
        applyScreenNodeDefaults(n,doc.canvas);
        if(op.params){commandKeys(op.params,["min","max","unit","precision"]);Object.assign(n.params,op.params);}
        doc.nodes.push(n);break;
      }
      case "moveNode":
        commandKeys(op,["op","id","x","y"]);n=item(op.id);
        if(n.type!=="screen-node")throw Error("仅可移动图元");
        n.x=commandNumber(op.x);n.y=commandNumber(op.y);break;
      case "setAppearance": {
        commandKeys(op,["op","id","appearance"]);n=item(op.id);
        if(!Object.hasOwn(screenAppearanceOptions(n.type==="pipe"?"pipe":n.symbol),op.appearance))throw Error("该图元不支持此外观");
        if(op.appearance==="picture")throw Error("自定义图稿请在外观面板载入");
        (n.type==="pipe"?n.style:n.params).appearance=op.appearance;break;
      }
      case "addPort":
        commandKeys(op,["op","id","port"]);n=item(op.id);
        if(n.type!=="screen-node")throw Error("管道不能添加连接点");
        commandKeys(op.port,["id","label","x","y","direction"]);
        n.ports=JSON.parse(JSON.stringify(screenPorts(n)));
        if(n.ports.some(p=>p.id===op.port.id))throw Error("连接点编号重复");
        n.ports.push({...op.port});break;
      case "connect": {
        commandKeys(op,["op","tempId","title","source","target","vertices"]);
        const endpoints={};
        for(const end of ["source","target"]) {
          commandKeys(op[end],["nodeId","portId"]);
          const device=item(op[end].nodeId),port=screenPorts(device).find(p=>p.id===op[end].portId);
          if(!port || end==="source"&&port.direction==="in" || end==="target"&&port.direction==="out")throw Error("连接点缺失或方向不匹配");
          endpoints[end]={nodeId:device.id,portId:port.id};
        }
        if(JSON.stringify(endpoints.source)===JSON.stringify(endpoints.target))throw Error("不能连接同一个接口");
        if(doc.pipes.some(p=>JSON.stringify(p.source)===JSON.stringify(endpoints.source)&&JSON.stringify(p.target)===JSON.stringify(endpoints.target)))throw Error("管道已经存在");
        n={id:fresh(op.tempId),type:"pipe",title:op.title||"工艺管道",...endpoints,vertices:op.vertices||[],style:{color:"#557f96",width:8,appearance:doc.canvas.appearance||"classic"},bindings:{}};
        doc.pipes.push(n);break;
      }
      case "bindSlot": {
        commandKeys(op,["op","id","slot","pointId"]);n=item(op.id);
        const slot=screenSlots(n).find(s=>s.key===op.slot);
        if(!slot)throw Error("数据槽位不存在");
        if(op.pointId===null || op.pointId==="") {pending.push({id:n.id,title:n.title,slot:op.slot,label:slot.label,kinds:slot.kinds});continue;}
        const point=doc.mappings.find(m=>m.id===op.pointId);
        if(!allowedPoints.includes(op.pointId))throw Error(`测点不在本批允许范围：${op.pointId}（${n.title} · ${op.slot}）`);
        if(!point || !slot.kinds.includes(point.kind))throw Error("测点类型不匹配");
        if((slot.role||slot.key)==='value' && n.params?.unit && point.unit && n.params.unit!==point.unit)throw Error("显示单位与测点单位不一致");
        if(n.bindings[op.slot] && n.bindings[op.slot]!==op.pointId)throw Error("已有绑定，请在属性面板确认更换");
        n.bindings[op.slot]=op.pointId;break;
      }
      default: throw Error("不支持的命令："+op.op);
    }
    changes.push({id:n.id,title:n.title,op:op.op});
  }
  if(doc.nodes.length>500 || doc.pipes.length>1000)throw Error("本页对象数量超出辅助设计上限");
  validateScreen(result,false);
  return {project:result,changes,pending};
}

// A deterministic engineering task; no language model or hidden source configuration.
export function pumpStationProposal(project,pageId,count=2,allowedPoints=[]) {
  if(![2,3,4].includes(count))throw Error("请选择 2～4 台泵");
  const doc=screenPageView(project,pageId),operations=[],refs={};
  const node=(title,symbol,x,y,w,h,params)=>{
    const matches=doc.nodes.filter(n=>n.title===title&&n.symbol===symbol);
    if(matches.length>1)throw Error("同名设备不唯一，请先整理："+title);
    const ref=matches[0]?.id||"new-"+title;refs[title]=ref;
    if(!matches.length){operations.push({op:"addNode",tempId:ref,symbol,title,x,y,w,h,...(params?{params}:{})});if(screenAppearanceOptions(symbol).depth)operations.push({op:"setAppearance",id:ref,appearance:"depth"});}
    return ref;
  };
  const bind=(id,slot,pointId)=>{
    const existing=doc.nodes.find(n=>n.id===id)||doc.pipes.find(n=>n.id===id);
    if(existing?.bindings?.[slot])return;
    operations.push({op:"bindSlot",id,slot,pointId:allowedPoints.includes(pointId)&&doc.mappings.some(m=>m.id===pointId)?pointId:null});
  };
  const pipe=(a,ap,b,bp,title)=>{
    const old=doc.pipes.find(p=>p.source.nodeId===a&&p.source.portId===ap&&p.target.nodeId===b&&p.target.portId===bp);
    if(old)return old.id;
    const id="pipe-"+title;operations.push({op:"connect",tempId:id,title,source:{nodeId:a,portId:ap},target:{nodeId:b,portId:bp}});return id;
  };
  const tank=node("集泥井","tank",180,230,220,580,{min:0,max:6,unit:"m",precision:2});bind(tank,"value","LT-101.PV");
  const ft=node("FT-101","readout",1460,420,300,150,{unit:"m³/h",precision:2});
  const existingFT=doc.nodes.find(n=>n.id===ft);
  for(const [id,x] of [["left",0],["right",100]])if(!existingFT||!screenPorts(existingFT).some(p=>p.id===id))operations.push({op:"addPort",id:ft,port:{id,label:id==="left"?"进口":"出口",x,y:50,direction:id==="left"?"in":"out"}});
  bind(ft,"value","FT-101.PV");
  const ins=[],outs=[];
  for(let i=0;i<count;i++){
    const y=260+i*165,key=`P-0${i+1}`;
    const input=node(`吸水分支 ${i+1}`,"junction",530,y+70,20,20),output=node(`出水分支 ${i+1}`,"junction",1330,y+70,20,20);
    const pump=node(key,"pump",720,y,230,160),valve=node(`CV-0${i+1}`,"checkValve",1080,y+45,140,70);
    ins.push(input);outs.push(output);
    bind(pump,"run",key+".run");bind(pump,"fault",key+".fault");bind(pump,"value",key+".hz");
    for(const [a,ap,b,bp,label] of [[input,"right",pump,"left","吸水"],[pump,"right",valve,"left","出水"],[valve,"right",output,"left","支路"]])bind(pipe(a,ap,b,bp,key+label),"run",key+".flow");
    if(i){bind(pipe(ins[i-1],"bottom",input,"top",key+"吸水母管"),"run","HEADER.flowing");bind(pipe(outs[i-1],"bottom",output,"top",key+"出水母管"),"run","HEADER.flowing");}
  }
  const middle=Math.floor((count-1)/2);
  const feed=doc.pipes.find(p=>p.source.nodeId===tank&&p.source.portId==="right"&&ins.includes(p.target.nodeId));
  const discharge=doc.pipes.find(p=>outs.includes(p.source.nodeId)&&p.target.nodeId===ft&&p.target.portId==="left");
  bind(feed?.id||pipe(tank,"right",ins[middle],"left","集泥井出口"),"run","HEADER.flowing");
  bind(discharge?.id||pipe(outs[middle],"right",ft,"left","出水总管"),"run","HEADER.flowing");
  if(!operations.length)throw Error("设备、管道和绑定已经齐全，无需补图");
  return {id:crypto.randomUUID(),pageId,baseRevision:screenRevision(project),operations};
}
