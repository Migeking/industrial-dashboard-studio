import { screenSlots } from "../../../packages/components/studio/screen-symbols.mjs";
import { pumpStationProposal, screenRevision } from "../../../packages/runtime/studio/screen-commands.mjs";
import { screenPageView } from "../../../packages/runtime/studio/screen-pages.mjs";
export const ScreenAssistant = {
  props:["project","pageId","result","error","points","session"],emits:["preview","cancel","apply","close"],
  setup(props,{emit}) {
    const state=props.session||Vue.reactive({chat:[],allowed:[],prompt:""});
    const count=Vue.ref(2),allowed=Vue.toRef(state,"allowed"),proposal=Vue.shallowRef(null),json=Vue.ref(""),localError=Vue.ref("");
    const prompt=Vue.toRef(state,"prompt"),busy=Vue.ref(false),elapsed=Vue.ref(0),chat=Vue.toRef(state,"chat"),config=Vue.reactive({provider:"ollama",baseUrl:"http://127.0.0.1:11434/v1",model:"qwen2.5-coder:7b"}),configMessage=Vue.ref(""),configured=Vue.ref(false);
    let controller,timer,sequence=0;
    const chatBox=Vue.ref(),reviewTitle=Vue.ref();
    Vue.watch(()=>chat.value.length,()=>Vue.nextTick(()=>{if(chatBox.value)chatBox.value.scrollTop=chatBox.value.scrollHeight;}));
    Vue.watch(()=>!!proposal.value,value=>{if(value)Vue.nextTick(()=>reviewTitle.value?.scrollIntoView({block:"start"}));});
    const request=async(url,body,signal)=>{const r=await fetch(url,{...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{}),signal});const data=await r.json();if(!r.ok)throw Error(data.error||"请求失败");return data;};
    const stop=()=>{sequence++;controller?.abort();clearInterval(timer);busy.value=false;};
    Vue.onMounted(async()=>{if(window.OFFLINE)return;try{Object.assign(config,await request("/api/assistant/config"));configured.value=true;}catch(e){configMessage.value=e.message;localError.value="AI 服务未就绪，请检查编辑器服务版本和模型设置："+e.message;}});
    Vue.onBeforeUnmount(stop);
    Vue.watch(()=>props.pageId,()=>{stop();});
    Vue.watch(()=>props.project,()=>{if(proposal.value&&proposal.value.baseRevision!==screenRevision(props.project))proposal.value=null;});
    const saveConfig=async()=>{try{configMessage.value="";Object.assign(config,await request("/api/assistant/config",{provider:config.provider,baseUrl:config.baseUrl,model:config.model}));configured.value=true;configMessage.value="模型设置已保存到本机";}catch(e){configMessage.value=e.message;}};
    const ask=async()=>{
      if(busy.value||!prompt.value.trim())return;
      const text=prompt.value.trim(),revision=screenRevision(props.project),pageId=props.pageId;
      const seq=++sequence;controller=new AbortController();busy.value=true;elapsed.value=0;localError.value="";proposal.value=null;emit("cancel");
      chat.value.push({role:"user",text});timer=setInterval(()=>elapsed.value++,1000);
      try{
        const data=await request("/api/assistant/propose",{project:props.project,pageId,prompt:text,allowed:allowed.value,history:chat.value.slice(-7,-1).map(m=>({role:m.role,content:m.text}))},controller.signal);
        if(seq!==sequence)return;
        if(props.pageId!==pageId||screenRevision(props.project)!==revision)throw Error("生成期间画面已变化，请根据当前画面重新提交需求");
        proposal.value=data.proposal;chat.value.push({role:"assistant",text:data.summary,questions:data.questions,meta:`${data.model} · ${(data.elapsedMs/1000).toFixed(1)} 秒 · ${data.attempts} 次校验`});
        prompt.value="";if(data.proposal)emit("preview",{proposal:data.proposal,allowed:allowed.value});
      }catch(e){if(seq===sequence&&e.name!=="AbortError")localError.value=e.message;}
      finally{if(seq===sequence){clearInterval(timer);busy.value=false;}}
    };
    const example=text=>{prompt.value=text;};
    const changed=()=>{proposal.value=null;emit("cancel");};
    const generate=()=>{try{localError.value="";proposal.value=pumpStationProposal(props.project,props.pageId,count.value,allowed.value);emit("preview",{proposal:proposal.value,allowed:allowed.value});}catch(e){localError.value=e.message;emit("cancel");}};
    const usePoints=()=>{stop();allowed.value=props.project.mappings.map(m=>m.id);changed();};
    const load=()=>{try{localError.value="";proposal.value=JSON.parse(json.value);emit("preview",{proposal:proposal.value,allowed:allowed.value});}catch(e){localError.value=e.message;emit("cancel");}};
    const bindings=Vue.computed(()=>proposal.value?.operations.map((op,index)=>({...op,index})).filter(op=>op.op==="bindSlot")||[]);
    const bindingTitle=op=>{
      const page=screenPageView(props.project,props.pageId),target=[...page.nodes,...page.pipes].find(n=>n.id===op.id);
      return target?.title||proposal.value?.operations.find(n=>n.tempId===op.id)?.title||op.id;
    };
    const connections=Vue.computed(()=>proposal.value?.operations.filter(op=>op.op==='connect')||[]);
    const endpointTitle=end=>bindingTitle({id:end.nodeId})+' · '+({left:'左口',right:'右口',top:'顶部',bottom:'底部'}[end.portId]||end.portId);
    const candidates=op=>{
      const current=screenPageView(props.project,props.pageId);
      const added=proposal.value?.operations.find(x=>x.tempId===op.id);
      const target=[...current.nodes,...current.pipes].find(n=>n.id===op.id)||
        (added?.op==="connect"?{type:"pipe"}:added?.op==="addNode"?{type:"screen-node",symbol:added.symbol,params:added.params||{}}:null);
      const slot=screenSlots(target).find(s=>s.key===op.slot);
      return props.project.mappings.filter(m=>allowed.value.includes(m.id)&&slot?.kinds.includes(m.kind));
    };
    const bind=(index,value)=>{
      const next=JSON.parse(JSON.stringify(proposal.value));next.operations[index].pointId=value||null;proposal.value=next;
      emit("preview",{proposal:next,allowed:allowed.value});
    };
    return {count,allowed,proposal,json,localError,changed,generate,usePoints,load,bindings,bindingTitle,connections,endpointTitle,candidates,bind,prompt,busy,elapsed,chat,chatBox,reviewTitle,config,configMessage,configured,saveConfig,ask,stop,example};
  },
  template:`<section class="screen-assistant" aria-label="辅助设计">
    <header><h2>AI 画图助手</h2><button @click="$emit('close')">关闭助手</button></header>
    <p class="muted">① 描述需求　② 检查预演　③ 确认应用<br>支持补图、接管和绑点。整批应用后可一键撤销。</p>
    <details class="assistant-model"><summary>模型设置 · {{configured?config.model:'读取设置中'}}</summary>
      <label>接口类型<select aria-label="模型接口类型" v-model="config.provider" :disabled="busy"><option value="ollama">本机 Ollama</option><option value="openai">兼容 Chat Completions</option></select></label>
      <label>模型接口地址<input aria-label="模型接口地址" v-model="config.baseUrl" :disabled="busy"></label>
      <label>模型名称<input aria-label="模型名称" v-model="config.model" :disabled="busy"></label>
      <p class="muted">本机 Ollama 无需密钥。兼容接口密钥由服务端 STUDIO_LLM_API_KEY 环境变量提供。</p>
      <button @click="saveConfig" :disabled="busy">保存模型设置</button><p v-if="configMessage">{{configMessage}}</p>
    </details>
    <div ref="chatBox" class="assistant-chat" aria-label="设计对话" aria-live="polite"><article v-for="(item,i) in chat" :key="i" :class="item.role"><b>{{item.role==='user'?'你':'AI 方案'}}</b><p>{{item.text}}</p><ul v-if="item.questions?.length"><li v-for="q in item.questions">{{q}}</li></ul><small v-if="item.meta">{{item.meta}}</small></article>
      <p v-if="!chat.length" class="muted">说出设备名称、流程方向和想显示的数据。例如：“在沉淀池下方补一台回流泵，接回混合池，已有设备保持不动。”</p>
    </div>
    <label>设计需求<textarea aria-label="设计需求" v-model="prompt" rows="5" maxlength="12000" :disabled="busy" placeholder="请描述要画什么、连接到哪里、使用哪些测点…" @keydown.ctrl.enter.prevent="ask"></textarea></label>
    <p class="muted">复杂工段建议分批：先放主流程，再补设备、接管，最后绑点。每批检查后应用。</p>
    <div class="assistant-examples"><button :disabled="busy" @click="example('从空白画布开始，本批只放7个图元：FT101进水流量仪表、TK101快速混合池、TK102絮凝池、TK103斜管沉淀池、FT102出水流量仪表，主流程从左向右；M101快速搅拌电机和M102慢速搅拌电机分别放在前两个池体上方。使用位号加中文名称，设备不重叠，留出管道空间。本批不接管、不绑定。')">先画主流程</button><button :disabled="busy" @click="example('给当前画面补齐缺失管道，主水路从左向右，回流管从下方绕回，不移动已有设备。')">补齐管道</button><button :disabled="busy" @click="example('根据设备名称与数据类型，将当前允许点表绑定到已有图元，已有绑定保持不变，不增加设备。缺少或含糊的点请留空并说明。')">匹配测点</button></div>
    <button class="wide" @click="usePoints" :disabled="busy||!project.mappings.length">使用当前点表（{{project.mappings.length}} 个）</button>
    <p class="muted">已允许 {{allowed.length}} 个测点。未接数据也可先画图，缺失绑定会标记待选点。</p>
    <button v-if="!busy" class="primary wide" :disabled="!prompt.trim()||!configured" @click="ask">生成设计预演</button>
    <div v-else class="assistant-generating"><p aria-live="polite">模型正在设计 · {{elapsed}} 秒<br><small>正在生成图元、管道并校验，可取消。生成完成前草稿不变。</small></p><button @click="stop">取消生成</button></div>
    <details class="assistant-guided"><summary>固定泵站任务（无需模型）</summary>
    <label>05 泵站规模<select aria-label="05 泵站规模" v-model.number="count" @change="changed"><option :value="2">两台并联泵</option><option :value="3">三台并联泵</option><option :value="4">四台并联泵</option></select></label>
    <p>补齐集泥井、泵、止回阀、管网和流量计。同名设备与已有管道继续使用，保留原位置和已有绑定。</p>
    <button class="primary wide" :disabled="busy" @click="generate">生成泵站预演</button>
    </details>
    <p v-if="error||localError" role="alert" class="definition-error">{{error||localError}}</p>
    <template v-if="proposal">
      <h3 ref="reviewTitle">检查本批改动</h3><p v-if="result" role="status">{{result.changes.length}} 项改动 · {{result.pending.length}} 个槽位待选点</p>
      <p class="muted">金色轮廓表示本批涉及的对象。此时画布仅用于查看；修改测点后自动重新预演。</p>
      <details v-if="connections.length" class="assistant-connections"><summary>核对接管（{{connections.length}} 条）</summary><ol><li v-for="op in connections" :key="op.tempId">{{endpointTitle(op.source)}} → {{endpointTitle(op.target)}}<small v-if="op.vertices?.length"> · {{op.vertices.length}} 个转折点</small></li></ol></details>
      <details v-if="result"><summary>查看操作清单</summary><ol><li v-for="(change,i) in result.changes" :key="i">{{change.title}} · {{ {addNode:'添加图元',moveNode:'移动',setAppearance:'切换外观',addPort:'添加接口',connect:'接管',bindSlot:'绑定测点'}[change.op] }}</li></ol></details>
      <div class="assistant-bindings"><label v-for="op in bindings" :key="op.index">{{bindingTitle(op)}} · {{ {value:'数值',run:'运行 / 流动',fault:'故障',open:'开到位',flow:'流量'}[op.slot]||op.slot }}
        <select :aria-label="'辅助绑定 '+op.id+' '+op.slot" :value="op.pointId||''" @change="bind(op.index,$event.target.value)"><option value="">稍后绑定</option><option v-for="m in candidates(op)" :value="m.id">{{m.label||m.id}} · {{m.id}} {{m.unit||''}} {{points[m.id]?.quality==='good'?'有效':points[m.id]?.quality||'待采集'}}</option></select></label></div>
      <div class="pair"><button @click="proposal=null;$emit('cancel')">取消预演</button><button class="primary" :disabled="!result" @click="$emit('apply')">确认应用到画布</button></div>
      <p class="muted">整批应用后按“撤销”或 Ctrl+Z，一次恢复原草稿。未完成的绑定会进入原发布检查。</p>
    </template>
    <details class="assistant-command-input"><summary>导入命令批次（开发调试）</summary><textarea aria-label="辅助设计命令" v-model="json" rows="8"></textarea><button @click="load">校验并预演命令</button></details>
  </section>`,
};
