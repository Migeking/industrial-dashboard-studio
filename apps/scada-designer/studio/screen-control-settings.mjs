import {screenSlots} from '../../../packages/components/studio/screen-symbols.mjs';
export const ScreenControlSettings={
 props:['item','doc','points'],emits:['start'],
 setup(props,{emit}){
  const candidate=Vue.ref('');
  const targets=Vue.computed(()=>screenSlots(props.item).filter(s=>s.key!=='value'));
  function change(fn){emit('start');fn();}
  function addTarget(){const m=props.doc.mappings.find(m=>m.id===candidate.value);if(!m)return;
   change(()=>{props.item.dataSlots=JSON.parse(JSON.stringify(screenSlots(props.item)));let i=1;while(props.item.dataSlots.some(s=>s.key==='target_'+i))i++;const key='target_'+i;
    props.item.dataSlots.push({key,label:m.label||m.id,kinds:[m.kind],role:'extra',required:true});props.item.bindings[key]=m.id;
    const base=props.points[m.id]?.value;for(const o of props.item.params.options)(o.values||={})[key]=typeof base===(m.kind==='boolean'?'boolean':'number')?base:m.kind==='boolean'?false:0;
   });candidate.value='';}
  function removeTarget(key){change(()=>{props.item.dataSlots=screenSlots(props.item).filter(s=>s.key!==key);delete props.item.bindings[key];for(const o of props.item.params.options)delete o.values[key];});}
  function addOption(){change(()=>{const values=props.item.symbol==='modeSwitch'?Object.fromEntries(targets.value.map(s=>[s.key,props.item.params.options[0]?.values[s.key]??(s.kinds[0]==='boolean'?false:0)])):{};
   props.item.params.options.push({label:'新选项',value:Math.max(...props.item.params.options.map(o=>o.value))+ (props.item.symbol==='trendRange'?3600:1),values});});}
  return {candidate,targets,change,addTarget,removeTarget,addOption};
 },
 template:`<fieldset class="definition-card control-settings"><legend>运行交互设置</legend>
 <p class="muted" v-if="item.symbol!=='trendRange'">工况与加减只改变当前预览的本地演示值。返回编辑或重新打开画面后复原；不写入现场。</p>
 <label class="screen-check"><input type="checkbox" aria-label="交互隐藏标题" :checked="item.params.hideLabel" @change="change(()=>item.params.hideLabel=$event.target.checked)" />隐藏标题和演示脚注</label>
 <template v-if="item.symbol==='numberStepper'"><div class="pair"><label>调节下限<input aria-label="调节下限" type="number" :value="item.params.min" @change="change(()=>item.params.min=Number($event.target.value))" /></label><label>调节上限<input aria-label="调节上限" type="number" :value="item.params.max" @change="change(()=>item.params.max=Number($event.target.value))" /></label></div><div class="pair"><label>调节步长<input aria-label="调节步长" type="number" :value="item.params.step" @change="change(()=>item.params.step=Number($event.target.value))" /></label><label>调节小数位<input aria-label="调节小数位" type="number" :value="item.params.precision" @change="change(()=>item.params.precision=Number($event.target.value))" /></label></div></template>
 <template v-else>
 <template v-if="item.symbol==='trendRange'"><label>目标趋势图<select aria-label="目标趋势图" :value="item.params.targetId" @change="change(()=>item.params.targetId=$event.target.value)"><option value="">请选择趋势图</option><option v-for="n in doc.nodes.filter(n=>n.symbol==='trend')" :value="n.id">{{n.title}}</option></select></label><label>默认时间范围<select aria-label="默认时间范围" :value="item.params.defaultSeconds" @change="change(()=>item.params.defaultSeconds=Number($event.target.value))"><option v-for="o in item.params.options" :value="o.value">{{o.label}}</option></select></label></template>
 <div class="definition-card" v-for="(o,i) in item.params.options" :key="i"><div class="pair"><label>选项名称<input :aria-label="'选项 '+(i+1)+' 名称'" :value="o.label" @change="change(()=>o.label=$event.target.value)" /></label><label>{{item.symbol==='trendRange'?'时间 / 秒':'工况编号'}}<input :aria-label="'选项 '+(i+1)+' 数值'" type="number" :value="o.value" @change="change(()=>o.value=Number($event.target.value))" /></label></div>
 <details v-if="targets.length" class="control-preset-values"><summary>{{o.label}} · {{targets.length}} 个联动值</summary><label v-for="s in targets">{{s.label}}<select v-if="s.kinds[0]==='boolean'" :aria-label="'选项 '+(i+1)+' · '+s.label" :value="String(o.values[s.key])" @change="change(()=>o.values[s.key]=$event.target.value==='true')"><option value="true">有效 / 运行</option><option value="false">无效 / 停止</option></select><input v-else type="number" :aria-label="'选项 '+(i+1)+' · '+s.label" :value="o.values[s.key]" @change="change(()=>o.values[s.key]=Number($event.target.value))" /></label>
 </details><button v-if="item.params.options.length>1" @click="change(()=>item.params.options.splice(i,1))">移除选项 {{i+1}}</button></div><button @click="addOption">添加切换选项</button>
 <template v-if="item.symbol==='modeSwitch'"><h4>工况联动测点</h4><div v-for="s in targets">{{s.label}}<button @click="removeTarget(s.key)">移除联动 {{s.label}}</button></div><label>添加联动测点<select aria-label="添加联动测点" v-model="candidate"><option value="">选择布尔或数值测点</option><option v-for="m in doc.mappings.filter(m=>['number','boolean'].includes(m.kind)&&!Object.values(item.bindings).includes(m.id))" :value="m.id">{{m.label}} · {{m.id}}</option></select></label><button :disabled="!candidate" @click="addTarget">添加联动</button></template>
 </template></fieldset>`
};
