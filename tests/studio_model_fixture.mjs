import { blankScreen } from "../packages/runtime/studio/screen-model.mjs";
export function scene13Blank(){
  const doc=blankScreen();doc.title="13 高密度絮凝沉淀 · 本机 AI 实测";
  doc.canvas.theme="cockpit-dark";doc.canvas.background="#080f16";doc.canvas.appearance="depth";
  const points=[];
  const add=(id,label,kind,value,unit="")=>points.push({id,label,kind,value,unit,quality:"good"});
  for(const [id,name] of [["TK101","快速混合池"],["TK102","絮凝池"],["TK103","斜管沉淀池"],["PAC","PAC药箱"],["PAM","PAM药箱"]])add(id+".level",name+"液位","number",3.2,"m");
  for(const [id,name] of [["M101","快速搅拌机"],["M102","慢速搅拌机"],["P201","PAC投加泵"],["P202","PAM投加泵"],["P301","污泥回流泵"],["P302","排泥泵"]]){
    add(id+".run",name+"运行","boolean",true);add(id+".fault",name+"故障","boolean",false);add(id+".hz",name+"频率","number",35,"Hz");
  }
  add("FT101.flow","进水流量","number",610,"m³/h");add("FT102.flow","出水流量","number",592,"m³/h");
  doc.source={kind:"json",data:JSON.stringify({points}),url:"",pollMs:1000,maxAgeMs:10000,demo:true};
  doc.mappings=points.map(p=>({id:p.id,label:p.label,kind:p.kind,unit:p.unit,path:"value",root:"points",keyField:"id",keyValue:p.id,timePath:"",fallbackTimePath:"",qualityPath:"quality",scale:1,offset:0,precision:2}));
  return doc;
}
export const scene13Prompt="从空白画布绘制13号高密度絮凝沉淀工段。主水路左到右：FT101进水仪表→TK101快速混合池→TK102絮凝池→TK103斜管沉淀池→FT102出水仪表。主水路中心在y=500附近。上方放PAC药箱及P201投加泵接到TK101顶部，放PAM药箱及P202投加泵接到TK102顶部；M101快速搅拌机和M102慢速搅拌机分别放在TK101和TK102附近但不挡池体。底部放P301污泥回流泵和P302排泥泵，TK103底部接P301后从下方绕回TK101底部，另一路从TK103底部接P302到名为脱水机房的text图元。保留上方标题空间，设备不要重叠，留出管道走线间距。所有设备title使用编号加中文名称。先只画图和接管，所有bindings使用空对象，不猜测点位。";
