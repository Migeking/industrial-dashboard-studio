(function () {
  'use strict';
  window.WaterProcess = { mount(host, state) {
    const T = THREE, scene = new T.Scene();
    scene.background = new T.Color('#cbd8e5');
    const renderer = new T.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .72;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const camera = new T.PerspectiveCamera(35,1,.1,150);
    const controls = new T.OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true; controls.minDistance=12; controls.maxDistance=60; controls.maxPolarAngle=1.4;
    scene.add(new T.HemisphereLight(0xffffff,0x8296a6,.9));
    const sun=new T.DirectionalLight(0xffffff,1.4); sun.position.set(-10,22,12); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-25,right:25,top:18,bottom:-18}); sun.shadow.bias=-.001; scene.add(sun);
    const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.65,...extra});
    const concrete=mat('#e1e8ec'), steel=mat('#9aafbd',{metalness:.65,roughness:.3}), blue=mat('#1267aa'), dark=mat('#385568'), purple=mat('#a079bd'), green=mat('#259b79');
    const glass=mat('#c4dce8',{transparent:true,opacity:.2,depthWrite:false});
    const animated=[],waters=[],flows=[],hits=[],valves=[],labels=[];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    function mesh(geometry,material,x,y,z,parent=scene){const o=new T.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    const box=(x,y,z,w,h,d,m=concrete,p=scene)=>mesh(new T.BoxGeometry(w,h,d),m,x,y,z,p);
    const cylinder=(x,y,z,r,h,m=steel,p=scene)=>mesh(new T.CylinderGeometry(r,r,h,20),m,x,y,z,p);
    function link(a,b,r,m=steel,p=scene){const va=new T.Vector3(...a),vb=new T.Vector3(...b),o=cylinder(...va.toArray(),r,va.distanceTo(vb),m,p);o.position.copy(va.add(vb).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vb.sub(new T.Vector3(...a)).normalize());return o;}
    function label(text,x,y,z){const c=document.createElement('canvas');c.width=1024;c.height=144;const ctx=c.getContext('2d');ctx.fillStyle='rgba(22,80,125,.98)';ctx.fillRect(0,0,1024,36);ctx.fillStyle='rgba(255,255,255,.99)';ctx.fillRect(0,36,1024,108);ctx.strokeStyle='#2779b3';ctx.lineWidth=5;ctx.strokeRect(2,2,1020,140);ctx.fillStyle='#ffffff';ctx.font='bold 20px Microsoft YaHei';ctx.textAlign='left';ctx.fillText('PROCESS UNIT',28,26);ctx.fillStyle='#0b3857';ctx.font='bold 54px Microsoft YaHei';ctx.textAlign='center';ctx.fillText(text,512,106);const texture=new T.CanvasTexture(c);texture.minFilter=T.LinearFilter;const s=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));s.position.set(x,y,z);s.scale.set(4.8,.675,1);scene.add(s);labels.push(s);}
    box(0,-.35,0,120,.5,90,mat('#b8c9d7'));const grid=new T.GridHelper(120,120,0xd8e3ec,0xc9d7e2);grid.position.y=-.08;scene.add(grid);
    function rail(x,z,w,d,y=2.65){for(const side of [-1,1]){for(let i=0;i<=w;i+=.8)link([x-w/2+i,y,z+side*d/2],[x-w/2+i,y+.65,z+side*d/2],.022);for(const h of [.32,.65])link([x-w/2,y+h,z+side*d/2],[x+w/2,y+h,z+side*d/2],.026);}}
    function water(x,z,w,d,color,branch){const material=mat(color,{transparent:true,opacity:.92,metalness:0,roughness:.28,side:T.DoubleSide});const g=new T.PlaneGeometry(w,d,28,18);g.rotateX(-Math.PI/2);const o=mesh(g,material,x,1.55,z);o.castShadow=false;waters.push({o,base:Float32Array.from(g.attributes.position.array),branch});return o;}
    function basin(x,z,w,d,title,color='#789d9b',branch=-1){box(x,.16,z,w,.3,d);box(x-w/2,1.35,z,.18,2.5,d);box(x+w/2,1.35,z,.18,2.5,d);box(x,1.35,z-d/2,w,2.5,.18);box(x,1.35,z+d/2,w,2.5,.12,glass);for(const s of [-1,1])box(x+s*w/2,2.63,z,.35,.15,d+.25);water(x,z,w-.3,d-.3,color,branch);rail(x,z,w,d);label(title,x,4.25,z-d/2);}
    basin(-10,-3,4,6,'01 进水井 / 粗格栅','#819e9f',0);
    basin(-5,-3,4,6,'02 提升泵 / 细格栅','#72999d',1);
    basin(.2,-3,4.6,6,'03 曝气沉砂','#9baf9b');
    basin(6,-3,5.1,6,'04 生化曝气','#65a5b7');
    basin(9,5.3,5,3.1,'06 消毒 / 清水出水','#4fa8c8');
    // Inclined bar screens, rake teeth, chain wheels and discharge conveyor.
    function screen(x,z,spacing,branch){const g=new T.Group();g.position.set(x,1.45,z);g.rotation.x=-.38;scene.add(g);for(let i=-1.45;i<=1.45;i+=spacing)box(i,0,0,.035,2.6,.09,steel,g);for(const s of [-1,1]){box(s*1.55,0,0,.12,2.9,.18,blue,g);const wheel=cylinder(s*1.55,1.45,0,.18,.15,blue,g);wheel.rotation.x=Math.PI/2;}const rake=box(0,0,.12,3.1,.1,.16,blue,g);animated.push({type:'rake',o:rake,branch});box(x,3,z-.35,3.6,.25,.65,dark);for(let i=0;i<9;i++)cylinder(x-1.4+i*.35,3.18,z-.35,.065,.16,steel);}
    screen(-10,-3,.18,0);screen(-5,-4.7,.09,1);
    function flange(x,y,z){const f=cylinder(x,y,z,.25,.09,steel);f.rotation.z=Math.PI/2;for(let k=0;k<8;k++){const a=k*Math.PI/4;const b=cylinder(x,y+Math.sin(a)*.19,z+Math.cos(a)*.19,.027,.13,dark);b.rotation.z=Math.PI/2;}}
    function pipe(points,branch=-1,color=blue,r=.12){const curve=new T.CurvePath();for(let i=1;i<points.length;i++)curve.add(new T.LineCurve3(new T.Vector3(...points[i-1]),new T.Vector3(...points[i])));const tube=mesh(new T.TubeGeometry(curve,Math.max(24,points.length*12),r,10,false),color,0,0,0);const dots=[];for(let i=0;i<12;i++){const dot=mesh(new T.SphereGeometry(r*.7,6,6),new T.MeshBasicMaterial({color:'#c4f4ff',depthTest:false}),0,0,0);dot.renderOrder=3;dots.push(dot);}flows.push({curve,dots,branch,t:0});for(const p of points)mesh(new T.SphereGeometry(r,10,10),color,...p);return tube;}
    // Connected process piping. Main stream folds back through the clarifier.
    pipe([[-14,1.3,-1],[-10,1.3,-1]],0);pipe([[-8,1.3,-1],[-7,1.3,-1]],0);
    pipe([[-3,2.4,-1],[-2.1,2.4,-1]],1);pipe([[2.5,1.3,-1],[3.45,1.3,-1]]);
    pipe([[8.55,1.3,-1],[11.9,1.3,-1],[11.9,.8,2.1],[1,.8,2.1],[1,.8,3.4]]);
    pipe([[3,1.2,5.4],[6.5,1.2,5.4]]);pipe([[11.5,1.2,5.4],[14,1.2,5.4]]);
    pipe([[1,.6,7.8],[1,.6,9],[-6,.6,9],[-6,.6,0]],-1,purple,.08);
    function valve(x,y,z,branch){const g=new T.Group();g.position.set(x,y,z);scene.add(g);const body=cylinder(0,0,0,.21,.48,blue,g);body.rotation.z=Math.PI/2;box(0,.36,0,.17,.5,.16,steel,g);const wheel=mesh(new T.TorusGeometry(.25,.045,8,24),green,0,.72,0,g);wheel.rotation.x=Math.PI/2;link([-.22,.72,0],[.22,.72,0],.025,steel,g);const gate=box(0,0,0,.08,.32,.32,green,g);flange(x-.3,y,z);flange(x+.3,y,z);g.traverse(o=>{if(o.isMesh){o.userData.tag=state.valves[branch].tag;hits.push(o);}});valves.push({gate,wheel,branch,visual:state.valves[branch].opening});}
    valve(-12.7,1.3,-1,0);valve(-3.5,2.4,-1,1);
    function pump(x,z,branch){box(x,.2,z,1.4,.25,1.1);const volute=cylinder(x,.65,z,.36,.42,blue);volute.rotation.x=Math.PI/2;const motor=cylinder(x,.68,z+.6,.25,.65,blue);motor.rotation.x=Math.PI/2;for(let i=0;i<8;i++){const fin=cylinder(x,.68,z+.35+i*.07,.28,.024,steel);fin.rotation.x=Math.PI/2;}box(x,.97,z+.65,.22,.15,.22,blue);const rotor=new T.Group();rotor.position.set(x,.65,z-.23);scene.add(rotor);for(let i=0;i<5;i++){const blade=box(0,.12,0,.09,.3,.04,steel,rotor);blade.rotation.z=i*Math.PI*2/5;blade.position.set(Math.sin(i*1.257)*.12,Math.cos(i*1.257)*.12,0);}animated.push({o:rotor,type:'rotor',branch});pipe([[x,.65,z-.25],[x,.65,z-.7],[x,2.4,z-.7],[-3.5,2.4,z-.7]],branch);const meter=cylinder(x,2.7,z-.7,.12,.09,concrete);meter.rotation.x=Math.PI/2;}
    pump(-6.1,1.1,0);pump(-4,1.1,1);
    // Submerged air distribution with visible diffuser disks and bubbles.
    const bubbles=[];
    for(const x of [.2,6]){for(let row=0;row<3;row++){const z=-5+row*1.65;pipe([[x-1.7,.45,z],[x+1.7,.45,z]],-1,steel,.04);for(let k=0;k<6;k++){cylinder(x-1.5+k*.6,.5,z,.13,.06,dark);for(let j=0;j<4;j++){const b=mesh(new T.SphereGeometry(.035+j*.012,6,6),new T.MeshBasicMaterial({color:'#e0f8ff',transparent:true,opacity:.7}),x-1.5+k*.6,.6+j*.23,z);b.castShadow=false;bubbles.push({o:b,phase:j*.23+k*.07,base:b.position.clone()});}}}pipe([[x-1.9,.4,-5],[x-1.9,2.9,-5],[x-1.9,2.9,-6.6]],-1,purple,.07);}
    // Circular secondary settling tank, radial bridge, central drive and scraper.
    const cx=1,cz=5.6;
    cylinder(cx,.18,cz,2.55,.3,concrete);
    const wall=mesh(new T.CylinderGeometry(2.55,2.55,1.9,64,1,true),concrete,cx,1.18,cz);wall.material=concrete.clone();wall.material.side=T.DoubleSide;
    const settled=mesh(new T.CircleGeometry(2.35,64),mat('#70a8b7',{transparent:true,opacity:.85,metalness:.2,roughness:.23}),cx,1.72,cz);settled.rotation.x=-Math.PI/2;
    const rim=mesh(new T.TorusGeometry(2.53,.11,8,64),steel,cx,2.17,cz);rim.rotation.x=Math.PI/2;
    cylinder(cx,1.3,cz,.4,2.2);const bridge=new T.Group();bridge.position.set(cx,2.35,cz);scene.add(bridge);box(0,0,0,4.9,.15,.45,steel,bridge);box(0,.2,0,.65,.35,.55,blue,bridge);animated.push({o:bridge,type:'bridge',branch:-1});label('05 二沉池 / 刮泥机',1,4.35,5.3);
    // UV racks and service walkways.
    for(let i=0;i<9;i++)link([7.2+i*.4,1.05,4.25],[7.2+i*.4,1.05,6.35],.045,purple);
    for(const x of [-7.6,-2.4,3]){for(let i=0;i<10;i++)box(x,.15+i*.25,1.8-i*.23,.8,.16,.29);link([x-.42,.4,2],[x-.42,3,0],.035);link([x+.42,.4,2],[x+.42,3,0],.035);}
    function view(pos,target){camera.position.set(...pos);controls.target.set(...target);controls.update();}
    const home=()=>view([19,23,29],[0,.5,0]);home();
    document.getElementById('viewHome').onclick=home;
    document.getElementById('viewTop').onclick=()=>view([0,35,.1],[0,0,0]);
    document.getElementById('viewFocus').onclick=()=>view([-1,11,15],[-7,1,-2]);
    const ray=new T.Raycaster(),pointer=new T.Vector2();let down;
    renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
    renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(hits)[0];if(hit){state.selectValve(hit.object.userData.tag);state.activeTab='control';}});
    const rate=branch=>branch<0?(state.valves[0].opening+state.valves[1].opening)/200:state.valves[branch].opening/100;
    let frame,last=performance.now();
    function draw(now){frame=requestAnimationFrame(draw);const dt=Math.min(.05,(now-last)/1000);last=now;controls.update();const moving=!reduced.matches;
      waters.forEach(({o,base,branch})=>{const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,base[i*3+1]+(moving?.025*Math.sin(base[i*3]*4+now*.0018)*Math.cos(base[i*3+2]*3+now*.001):0)*rate(branch));a.needsUpdate=true;o.geometry.computeVertexNormals();});
      animated.forEach(({o,type,branch})=>{if(!moving)return;const r=rate(branch);if(type==='rake'){if(r>0)o.position.y=Math.sin(now*.001*r)*1.15;}else if(type==='bridge')o.rotation.y+=dt*.05*r;else o.rotation.z+=dt*7*r;});
      bubbles.forEach(b=>{b.o.visible=moving&&rate(-1)>.01;if(b.o.visible)b.o.position.y=.58+((now*.0005+b.phase)%1)*.9;});
      valves.forEach(v=>{const target=state.valves[v.branch].opening;v.visual+= (target-v.visual)*Math.min(1,dt*4);v.gate.position.y=v.visual*.004;if(moving&&Math.abs(target-v.visual)>.1)v.wheel.rotation.z+=dt*4;});
      flows.forEach(f=>{const r=rate(f.branch);if(moving)f.t=(f.t+dt*.15*r)%1;f.dots.forEach((d,i)=>{d.visible=r>.001;d.position.copy(f.curve.getPoint((f.t+i/f.dots.length)%1));});});
      host.dataset.flowRates=JSON.stringify([rate(0),rate(1),rate(-1)]);renderer.render(scene,camera);
    }
    function resize(){renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();}
    resize();frame=requestAnimationFrame(draw);
    const dispose=()=>{cancelAnimationFrame(frame);controls.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});renderer.dispose();};
    window.addEventListener('pagehide',dispose,{once:true});
    return {resize,highlight(){},pulse(){}};
  }};
})();
