import { waterEquipment } from '../../packages/components/studio/water-equipment.mjs';
const string={type:"string"},number={type:"number"};
const bindingKeys=[...new Set(['value','run','fault','open','flow',...Object.values(waterEquipment).flatMap(d=>d.slots.map(s=>s.key))])];
const bindings={type:"object",properties:Object.fromEntries(bindingKeys.map(k=>[k,{type:["string","null"]}])),additionalProperties:false};
export const screenIntentSchema={type:"object",required:["summary","questions","nodes","links"],additionalProperties:false,properties:{
  summary:string,questions:{type:"array",items:string},
  nodes:{type:"array",maxItems:80,items:{type:"object",required:["key"],additionalProperties:false,properties:{
    key:string,symbol:{type:"string",enum:["tank","pump","fan","valve","checkValve","junction","readout","text","rect","trend","gauge","barGauge",...Object.keys(waterEquipment)]},title:string,x:number,y:number,w:number,h:number,text:string,move:{type:"boolean"},bindings,
    params:{type:"object",additionalProperties:false,properties:{min:number,max:number,unit:string,precision:{type:"integer"}}},
  }}},
  links:{type:"array",maxItems:100,items:{type:"object",required:["from","to","fromPort","toPort","title","vertices"],additionalProperties:false,properties:{from:string,to:string,title:string,fromPort:{type:"string",enum:["left","right","top","bottom"]},toPort:{type:"string",enum:["left","right","top","bottom"]},bindings,vertices:{type:"array",items:{type:"object",required:["x","y"],additionalProperties:false,properties:{x:number,y:number}}}}}},
}};

// Existing devices have a finite tool vocabulary: constrain keys, slots and point candidates.
export function screenIntentRequirements(prompt) {
  // Only explicit, current-batch numeric instructions. Never infer counts from process names.
  const match=prompt.match(/(?:本批|本次|这次)(?:只)?(?:新增|添加|放置|放|补|增加)\s*(\d+)\s*个图元/);
  const count=match?Number(match[1]):null;
  const pipes=prompt.match(/(?:本批|本次|这次)(?:只)?新增\s*(\d+)\s*条管道/);
  const pipeCount=pipes?Number(pipes[1]):null;
  return {...(count!==null&&count>=0&&count<=80?{addNodes:count}:{}),...(pipeCount!==null&&pipeCount>=0&&pipeCount<=100?{addPipes:pipeCount}:{})};
}
export function screenIntentSchemaFor(context,requirements={}) {
  const schema=structuredClone(screenIntentSchema),base=schema.properties.nodes.items;
  if(requirements.addNodes!==undefined)schema.properties.nodes.minItems=requirements.addNodes;
  if(requirements.addPipes!==undefined)schema.properties.links.minItems=requirements.addPipes;
  if(!context.nodes.length)return schema;
  const existing=context.nodes.map(n=>{
    const tag=n.title.match(/^[A-Za-z][A-Za-z0-9_-]*/)?.[0];
    const own=tag&&context.points.some(p=>p.id.startsWith(tag+'.'));
    const properties=Object.fromEntries(n.slots.map(s=>[s.key,{enum:[null,...context.points.filter(p=>s.kinds.includes(p.kind)&&(!own||p.id.startsWith(tag+'.'))).map(p=>p.id)]}]));
    return {type:'object',required:['key'],additionalProperties:false,properties:{key:{const:n.key},bindings:{type:'object',additionalProperties:false,properties},move:{type:'boolean'},x:{type:'number'},y:{type:'number'}}};
  });
  const added={...base,required:['key','symbol','title','x','y','w','h']};
  schema.properties.nodes.items={anyOf:[...existing,added]};
  return schema;
}
