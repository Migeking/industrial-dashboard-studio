import fs from "node:fs/promises";
import path from "node:path";
import { validateScreen } from "../../packages/runtime/studio/screen-model.mjs";
import { compileScreenIntent, screenModelContext } from "../../packages/runtime/studio/screen-intent.mjs";
import { screenIntentSchemaFor, screenIntentRequirements } from "./model-schema.mjs";

const defaults={provider:"ollama",baseUrl:"http://127.0.0.1:11434/v1",model:"qwen2.5-coder:7b"};
export function modelAssistant(dir) {
  const file=path.join(dir,"model.json");
  async function config(){let saved={};try{saved=JSON.parse(await fs.readFile(file,"utf8"));}catch(e){if(e.code!=="ENOENT")throw e;}
    return {...defaults,...saved,...(process.env.STUDIO_LLM_BASE_URL?{baseUrl:process.env.STUDIO_LLM_BASE_URL}:{}),...(process.env.STUDIO_LLM_MODEL?{model:process.env.STUDIO_LLM_MODEL}:{})};}
  async function publicConfig(){const c=await config();return {provider:c.provider,baseUrl:c.baseUrl,model:c.model,hasKey:!!process.env.STUDIO_LLM_API_KEY};}
  async function save(c){const url=new URL(c.baseUrl);if(!["ollama","openai"].includes(c.provider))throw Error("模型接口类型无效");if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error("模型地址应为不含凭据的 HTTP(S) API 地址");if(typeof c.model!=="string"||!c.model.trim()||c.model.length>200)throw Error("请输入模型名称");await fs.writeFile(file,JSON.stringify({provider:c.provider,baseUrl:url.href.replace(/\/$/,""),model:c.model.trim()}));return publicConfig();}
  async function propose(data,signal){
    const {project,pageId,prompt,allowed:allowedPoints=[],history=[]}=data;
    validateScreen(project,false);
    if(typeof prompt!=="string"||!prompt.trim()||prompt.length>12000)throw Error("请输入 1～12000 字的设计需求");
    if(!Array.isArray(allowedPoints)||allowedPoints.some(id=>typeof id!=="string"||!project.mappings.some(m=>m.id===id)))throw Error("允许点表无效");
    if(!Array.isArray(history)||history.length>6||history.some(m=>!["user","assistant"].includes(m?.role)||typeof m.content!=="string"||m.content.length>12000))throw Error("设计对话过长或格式无效");
    const c=await config(),context=screenModelContext(project,pageId,allowedPoints),requirements=screenIntentRequirements(prompt);
    const messages=[{role:"system",content:`你是工业 SCADA 画面设计助手。用户要求画图、接管或绑定测点。只返回一个 JSON 对象，不要 Markdown，不要代码。你没有发布或操作设备的能力。
格式：{"summary":"中文说明本批变更","questions":[],"nodes":[{"key":"唯一短名或已有key","symbol":"tank","title":"设备名称","x":100,"y":200,"w":220,"h":300,"params":{"min":0,"max":6,"unit":"m","precision":2},"bindings":{"value":"已提供的点ID"}}],"links":[{"from":"图元key","to":"图元key","fromPort":"right","toPort":"left","title":"管道名称","bindings":{}}]}。
可用 symbol：tank池体(value数值必填)，pump泵(run布尔必填/fault布尔/value数值)，fan离心风机(run布尔必填/fault布尔/value数值)，valve阀门(open布尔必填/fault布尔/value数值)，checkValve止回阀，junction分支(建议20×20)，readout仪表(value数值必填)，text文字(用text字段)，rect背景，trend趋势(value数值必填)，gauge仪表(value数值必填)，barGauge液位计(value数值必填)。管道可绑run布尔和flow数值。
上下文components是可直接使用的成套工艺与独立设备目录。独立电动机使用motor，搅拌机使用verticalMixer或submersibleMixer，不用fan代替电机。用户要求高效沉淀池、MBR、加药、过滤等单元时优先选择目录里对应symbol，不用普通tank冒充完整单元。目录明确每种组件的端口含义、尺寸和独立测点槽位；如用户明确指定基础图元则遵守。成套装置的运行反馈仅绑定用户提供的整机反馈，不把多台设备的状态自行合并。
params只可用min/max/unit/precision。所有节点都写x/y/w/h，位置在1920×1080内，尺寸为正且不越界。主流程从左到右，相邻设备留至少80像素接管空间。标题区y<130，工艺区y=200～650，加药/回流区y=740～980；复杂画面设备适当缩小。图元不要互相遮挡，文字与设备留间距。管道走正交路线，必要时vertices:[{"x":500,"y":700}]指定拐点，绕开无关设备。接口left/right/top/bottom均可用。
用户指定的管道接口和拐点必须逐条遵守：右/左/顶部/底部分别是right/left/top/bottom，不要用默认接口替换。每条links必须写fromPort、toPort和vertices；无指定拐点时vertices为空数组。
每个已有图元的slots列出可绑定槽位，只可使用该图元实际支持的槽位；电机/泵的频率使用value，绝不可用flow。只使用上下文points里真实存在且类型相容的点ID；不确定则bindings相应槽位填null并写questions，不要编造测点。unit必须与绑定点unit一致，或留空。没有点表也要先画图，缺点留待选。数据已归一化，1/true是有效，不再取反。
绑定已有图元时，nodes条目只需key和bindings，不必重复坐标、尺寸、名称或类型。新建图元仍必须完整提供symbol/title/x/y/w/h。增量修改必须复用上下文已有key或唯一设备名称/位号，不要重建已有图元；已有图元仅绑点时可只写key和bindings，省略symbol/title/x/y/w/h。新增图元仍必须提供完整名称、类型和几何；nodes只列新增或需绑定的设备；已有图元位置保持，用户明确要求移动才加move:true和x/y。links只补所需管道；已有绑定不要更换。最多80节点100管道。summary应诚实说明只是通用图元示意，不是真实三维或设备控制。`},{role:"user",content:JSON.stringify({request:prompt,context})}];
    messages.splice(1,0,...history);
    const started=Date.now(),deadline=AbortSignal.any([signal,AbortSignal.timeout(600000)]);let last="";
    for(let attempt=1;attempt<=3;attempt++){
      let response;
      const local=c.provider==="ollama",base=c.baseUrl.replace(/\/$/,""),url=(local?base.replace(/\/v1$/,"")+"/api/chat":base+"/chat/completions");
      const requestBody=local
        ? {model:c.model,messages,stream:true,format:screenIntentSchemaFor(context,requirements),options:{temperature:0,num_ctx:8192,num_predict:6500}}
        : {model:c.model,messages,stream:false,temperature:0,max_tokens:6500,response_format:{type:"json_object"}};
      try{response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",...(!local&&process.env.STUDIO_LLM_API_KEY?{Authorization:"Bearer "+process.env.STUDIO_LLM_API_KEY}:{})},body:JSON.stringify(requestBody),signal:deadline});}
      catch(e){if(signal.aborted)throw Error("已取消生成");throw Error(e.name==="TimeoutError"?"模型生成超时，请缩小本批需求后重试":"无法连接模型，请检查本机 Ollama 是否运行以及 API 地址");}
      if(!response.ok)throw Error(`模型接口返回 HTTP ${response.status}，请检查模型名称与服务状态`);
      let raw;
      if(local){
        const decoder=new TextDecoder();let buffer="",content="";
        const accept=line=>{if(!line.trim())return;const chunk=JSON.parse(line);if(chunk.error)throw Error("本机模型执行失败，请检查 Ollama 日志");content+=chunk.message?.content||"";};
        for await(const bytes of response.body){buffer+=decoder.decode(bytes,{stream:true});let end;while((end=buffer.indexOf("\n"))>=0){accept(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
        buffer+=decoder.decode();accept(buffer);raw=content;
      }else {const body=await response.json();raw=body.choices?.[0]?.message?.content;}
      if(typeof raw!=="string")throw Error("模型接口未返回设计内容");
      try{
        const intent=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,"").replace(/\s*```\s*$/,""));
        const clarification=Array.isArray(intent.nodes)&&!intent.nodes.length&&Array.isArray(intent.links)&&!intent.links.length&&Array.isArray(intent.questions)&&intent.questions.length;
        const proposal=clarification?null:compileScreenIntent(project,pageId,intent,allowedPoints);
        if(!clarification&&requirements.addNodes!==undefined&&(proposal?.operations.filter(op=>op.op==='addNode').length||0)!==requirements.addNodes)throw Error(`本批要求新增 ${requirements.addNodes} 个图元，方案新增数量不符，请完整输出本批全部设备，保留已有设备`);
        if(!clarification&&requirements.addPipes!==undefined&&(proposal?.operations.filter(op=>op.op==='connect').length||0)!==requirements.addPipes)throw Error(`本批要求新增 ${requirements.addPipes} 条管道，方案新增数量不符，请完整输出本批全部管道，保留已有管道`);
        return {proposal,intent,allowed:allowedPoints,summary:!proposal&&!clarification?"本批没有产生可应用的变更。"+(intent.summary||"请补充需求。") :typeof intent.summary==="string"?intent.summary:"设计已生成，请检查预演",questions:Array.isArray(intent.questions)?intent.questions.filter(q=>typeof q==="string").slice(0,20):[],model:c.model,attempts:attempt,elapsedMs:Date.now()-started};
      }catch(e){last=e.message;console.warn("AI设计校验失败",attempt,last);messages.push({role:"assistant",content:raw},{role:"user",content:"设计未通过校验："+last+"。请修正后返回完整 JSON，不要解释。"});}
    }
    throw Error("模型方案经 3 次校验仍未通过："+last+"。请缩小需求或补充明确的设备和测点。");
  }
  return {publicConfig,save,propose};
}
