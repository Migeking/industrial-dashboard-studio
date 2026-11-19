// Explicit opt-in real local Ollama acceptance, no mocked inference.
import fs from "node:fs/promises";
import { scene13Blank,scene13Prompt } from "./studio_model_fixture.mjs";
import { executeScreenCommands } from "../packages/runtime/studio/screen-commands.mjs";
const base=process.env.STUDIO_TEST_URL||"http://127.0.0.1:8138",out=new URL("../works/scada-model-acceptance/",import.meta.url);
await fs.mkdir(out,{recursive:true});
const doc=scene13Blank();
await fs.writeFile(new URL("blank.json",out),JSON.stringify(doc,null,2));
const t=Date.now();console.log("Calling real local model, scene 13 from blank…");
const r=await fetch(base+"/api/assistant/propose",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({project:doc,pageId:"main",prompt:scene13Prompt,allowed:[]}),signal:AbortSignal.timeout(600000)});
const data=await r.json();await fs.writeFile(new URL("initial-response.json",out),JSON.stringify(data,null,2));
if(!r.ok)throw Error(data.error);
const result=executeScreenCommands(doc,data.proposal,[]);
await fs.writeFile(new URL("initial-project.json",out),JSON.stringify(result.project,null,2));
console.log(JSON.stringify({model:data.model,seconds:(Date.now()-t)/1000,nodes:result.project.nodes.length,pipes:result.project.pipes.length,pending:result.pending.length,attempts:data.attempts,summary:data.summary}));
