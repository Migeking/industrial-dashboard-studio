import {screenEndpointPosition} from './screen-model.mjs';
import {screenPorts} from '../../components/studio/screen-symbols.mjs';
import {waterEquipment} from '../../components/studio/water-equipment.mjs';

const classicObstacles = new Set(["pump","fan","tank","valve","checkValve"]);
const pidObstacles = new Set(["pidBasin","pidMeteringPump"]);
export function equipmentObstacle(node,padding=8,includeClassic=false){
  const d=waterEquipment[node.symbol];
  if(!d){
    if (!pidObstacles.has(node.symbol) && !(includeClassic && classicObstacles.has(node.symbol))) return null;
    const angle = node.angle * Math.PI / 180;
    const halfWidth = (Math.abs(Math.cos(angle)) * node.w + Math.abs(Math.sin(angle)) * node.h) / 2 + padding;
    const halfHeight = (Math.abs(Math.sin(angle)) * node.w + Math.abs(Math.cos(angle)) * node.h) / 2 + padding;
    const x = node.x + node.w / 2, y = node.y + node.h / 2;
    return {id:node.id,left:x-halfWidth,right:x+halfWidth,top:y-halfHeight,bottom:y+halfHeight};
  }
  const k=Math.min(node.w/d.w,node.h/d.h),width=d.w*k,height=d.pictureHeight*k;
  const pictureBottom=node.y+d.pictureHeight/d.h*node.h/2+height/2;
  const labelBottom=d.contractVersion&&!node.params?.compact
    ? node.y+Math.min(1,(d.pictureHeight+111)/d.h)*node.h
    : pictureBottom;
  return {id:node.id,left:node.x+(node.w-width)/2-padding,right:node.x+(node.w+width)/2+padding,
    top:node.y+d.pictureHeight/d.h*node.h/2-height/2-padding,bottom:Math.max(pictureBottom,labelBottom)+padding};
}
export function routeScreenPipe(doc,pipe){
  if(pipe.vertices.length)return pipe.vertices; // Explicit engineering routes always win.
  const a=screenEndpointPosition(doc,pipe.source),b=screenEndpointPosition(doc,pipe.target);
  const process=pipe.style?.appearance==='process';
  const obstacles=doc.nodes.filter(n=>!n.hidden).map(n=>equipmentObstacle(n,8,process)).filter(Boolean);
  if(!process&& ![pipe.source,pipe.target].some(e=>obstacles.some(o=>o.id===e.nodeId)))return null;
  if(!obstacles.length&&!process)return null;
  const escape=(point,end)=>{
    const o=obstacles.find(o=>o.id===end.nodeId);if(!o)return point;
    const node=doc.nodes.find(n=>n.id===end.nodeId);
    const port=screenPorts(node).find(p=>p.id===end.portId);
    const sides=['right','bottom','left','top'];
    const preferred=port?.routingSide??end.portId;
    const natural=port?(Math.abs(port.x-50)>Math.abs(port.y-50)?port.x<50?'left':'right':port.y<50?'top':'bottom'):'right';
    const index=sides.indexOf(sides.includes(preferred)?preferred:natural);
    const side=sides[((index+Math.round(node.angle/90))%4+4)%4];
    return side==='left'?{x:o.left-8,y:point.y}:side==='right'?{x:o.right+8,y:point.y}:
      side==='top'?{x:point.x,y:o.top-8}:{x:point.x,y:o.bottom+8};
  };
  const start=escape(a,pipe.source),finish=escape(b,pipe.target);
  const region={left:Math.min(start.x,finish.x)-160,right:Math.max(start.x,finish.x)+160,top:Math.min(start.y,finish.y)-160,bottom:Math.max(start.y,finish.y)+160};
  const blocks=obstacles.filter(o=>o.right>=region.left&&o.left<=region.right&&o.bottom>=region.top&&o.top<=region.bottom);
  if(blocks.length>35)return null;
  const unique=values=>[...new Set(values.filter(v=>v>=8&&v<=1912).map(v=>Math.round(v*100)/100))].sort((x,y)=>x-y);
  const xs=unique([start.x,finish.x,...blocks.flatMap(o=>[o.left-2,o.right+2])]);
  const ys=[...new Set([start.y,finish.y,...blocks.flatMap(o=>[o.top-2,o.bottom+2])].filter(v=>v>=8&&v<=1072).map(v=>Math.round(v*100)/100))].sort((x,y)=>x-y);
  const inside=(x,y)=>blocks.some(o=>x>o.left&&x<o.right&&y>o.top&&y<o.bottom);
  const free=(p,q)=>!blocks.some(o=>p.x===q.x?p.x>o.left&&p.x<o.right&&Math.max(p.y,q.y)>o.top&&Math.min(p.y,q.y)<o.bottom:
    p.y>o.top&&p.y<o.bottom&&Math.max(p.x,q.x)>o.left&&Math.min(p.x,q.x)<o.right);
  const closest=(values,v)=>values.findIndex(x=>Math.abs(x-v)<.02);
  const si=closest(xs,start.x),sj=closest(ys,start.y),ti=closest(xs,finish.x),tj=closest(ys,finish.y);
  if([si,sj,ti,tj].includes(-1))return null;
  const key=(x,y,d)=>`${x},${y},${d}`,initial={x:si,y:sj,d:0,g:0},queue=[initial],dist=new Map([[key(si,sj,0),0]]),previous=new Map();
  let last;
  while(queue.length){
    queue.sort((p,q)=>(q.g+Math.abs(xs[q.x]-finish.x)+Math.abs(ys[q.y]-finish.y))-(p.g+Math.abs(xs[p.x]-finish.x)+Math.abs(ys[p.y]-finish.y)));
    const at=queue.pop(),id=key(at.x,at.y,at.d);if(at.g!==dist.get(id))continue;
    if(at.x===ti&&at.y===tj){last=id;break;}
    for(const [dx,dy,d] of [[1,0,1],[-1,0,1],[0,1,2],[0,-1,2]]){
      const x=at.x+dx,y=at.y+dy;if(x<0||y<0||x>=xs.length||y>=ys.length||inside(xs[x],ys[y]))continue;
      const p={x:xs[at.x],y:ys[at.y]},q={x:xs[x],y:ys[y]};if(!free(p,q))continue;
      const g=at.g+Math.abs(q.x-p.x)+Math.abs(q.y-p.y)+(at.d&&at.d!==d?24:0),next=key(x,y,d);
      if(g>=(dist.get(next)??Infinity))continue;dist.set(next,g);previous.set(next,id);queue.push({x,y,d,g});
    }
  }
  if(!last)return null;
  const points=[];for(let id=last;id;id=previous.get(id)){const [x,y]=id.split(',').map(Number);points.unshift({x:xs[x],y:ys[y]});}
  const all=[a,...points,b],simplified=[];
  for(const p of all){if(simplified.length&&Math.abs(simplified.at(-1).x-p.x)<.02&&Math.abs(simplified.at(-1).y-p.y)<.02)continue;
    while(simplified.length>1){const q=simplified.at(-1),r=simplified.at(-2);if(Math.abs(q.x-r.x)<.02&&Math.abs(q.x-p.x)<.02||Math.abs(q.y-r.y)<.02&&Math.abs(q.y-p.y)<.02)simplified.pop();else break;}simplified.push(p);}
  return simplified.slice(1,-1);
}
