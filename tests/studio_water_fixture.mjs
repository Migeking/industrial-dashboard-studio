import {blankScreen,screenNode} from '../packages/runtime/studio/screen-model.mjs';
import {waterEquipment,waterEquipmentGroups} from '../packages/components/studio/water-equipment.mjs';

const primaryReadings={gravityThickener:[2.6,"m"],screwPump:[35,"Hz"],decanterCentrifuge:[2800,"rpm"],polymerPreparation:[4.2,"kg/tDS"],cakeSilo:[56,"%"],staticMixer:[72,"m³/h"],motor:[35,"Hz"],submersibleMixer:[32,"Hz"],gritSeparator:[18,"Hz"],dissolvedAirFlotation:[1.2,"NTU"],liftStation:[2.8,"m"],
  submersiblePump:[35,'Hz'],verticalMixer:[28,'Hz'],chemicalTank:[2.8,'m'],pressureFilter:[.32,'MPa'],
  screenRake:[25,'Hz'],screwPress:[18,'Hz'],lamellaClarifier:[.85,'NTU'],circularClarifier:[1.65,'m'],
  aerationTank:[2.4,'mg/L'],mbrModule:[18.6,'kPa'],dosingSkid:[2.6,'m'],filterTrain:[.12,'NTU'],
  roSkid:[12.5,'μS/cm'],uvChannel:[42,'mJ/cm²'],highRateClarifier:[.85,'NTU'],dualChemicalDosing:[2.6,'m'],
};
const extraReadings={solids:[3.2,"%"],torque:[62,"%"],moisture:[78.6,"%"],sludgeLevel:[1.7,'m'],level:[3.1,'m'],recycleFlow:[42,'m³/h'],flow:[580,'m³/h'],
  permeateFlow:[560,'m³/h'],doseFlow:[24,'L/h'],frequency:[32,'Hz'],pacRate:[26,'mg/L'],pamRate:[1.2,'mg/L'],
  differentialPressure:[.06,'MPa'],headLoss:[.28,'m'],pressure:[1.2,'MPa'],airFlow:[480,'m³/h'],
  intensity:[86,'%'],turbidity:[.35,'NTU'],feedFlow:[8.4,'m³/h'],dryness:[22,'%'],tankBLevel:[2.3,'m'],
  doseFlowA:[24,'L/h'],doseFlowB:[15,'L/h'],frequencyA:[32,'Hz'],frequencyB:[28,'Hz'],rapidHz:[120,'Hz'],flocHz:[18,'Hz']};
export function waterComponentBlank(){
  const d=blankScreen();d.title='水处理组件 · 空白实测';d.canvas.theme='process-gray';d.canvas.purpose='process';
  const rows=[];
  for(const [symbol,def] of Object.entries(waterEquipment))for(const slot of def.slots){
    const [value,unit]=slot.kinds[0]==='boolean'?[slot.key==='run'||slot.key.endsWith('Run'),'']:slot.key==='value'?primaryReadings[symbol]:extraReadings[slot.key];
    rows.push({id:def.prefix+'101.'+slot.key,label:def.label+' · '+slot.label,kind:slot.kinds[0],value,unit,quality:'good'});
  }
  d.source.data=JSON.stringify({points:rows});d.source.demo=true;
  d.mappings=rows.map(p=>({id:p.id,label:p.label,kind:p.kind,unit:p.unit,path:'value',root:'points',keyField:'id',keyValue:p.id,timePath:'',fallbackTimePath:'',qualityPath:'quality',scale:1,offset:0,precision:2}));
  return d;
}
export function waterComponentGallery(){
  const d=waterComponentBlank();d.title='沉淀与生化 · 成套工艺组件';d.canvas.theme='cockpit-dark';d.canvas.background='#0c1d29';
  d.pages=[{id:'clean-water',title:'净水与消毒 · 成套工艺组件',nodes:[],pipes:[]},{id:'equipment',title:'独立设备 · 通用组件',nodes:[],pipes:[]}];
  d.pages.forEach(page=>{page.canvas=structuredClone(d.canvas);});
  const originalUnits=['lamellaClarifier','circularClarifier','aerationTank','mbrModule','dosingSkid','filterTrain','roSkid','uvChannel'];
  d.pages.push({id:'more-equipment',title:'新增独立设备',canvas:structuredClone(d.canvas),nodes:[],pipes:[]},{id:'more-units',title:'新增成套装置',canvas:structuredClone(d.canvas),nodes:[],pipes:[]});
  const sets=[originalUnits.slice(0,4),originalUnits.slice(4),['submersiblePump','verticalMixer','chemicalTank','pressureFilter','screenRake','screwPress'],['motor','submersibleMixer','gritSeparator'],['dissolvedAirFlotation','liftStation']];
  for(let page=0;page<sets.length;page++){
    const target=page?d.pages[page-1]:d;
    const title=screenNode('text','gallery-heading-'+page,60,25);title.text=target.title;title.style.color='#e1eef4';title.w=1700;title.style.fontSize=32;target.nodes.push(title);
    sets[page].forEach((key,i)=>{
      const def=waterEquipment[key],cols=(page===2||page===3)?3:2;
      const node=screenNode(key,'gallery-'+key,80+(i%cols)*((page===2||page===3)?610:960),120+Math.floor(i/cols)*470);
      node.w=(page===2||page===3)?440:800;node.h=430;node.style.color='#d7e8f0';node.style.fontSize=20;
      node.title=def.label;node.bindings=Object.fromEntries(def.slots.map(s=>[s.key,def.prefix+'101.'+s.key]));target.nodes.push(node);
    });
  }
  return d;
}
