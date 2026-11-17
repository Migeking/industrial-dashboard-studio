import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConnection } from "./studio/model.mjs";

const script = fileURLToPath(new URL("./bridge.py", import.meta.url));
const sessions = new Map();
const python = process.env.STUDIO_PYTHON || "python";

export async function browseNodes(input) {
  const url = new URL(input.endpoint);
  if (url.protocol !== "opc.tcp:" || url.username || url.password)
    throw Error("请输入 OPC UA 端点地址");
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-X", "utf8", script, "--browse"], {
      windowsHide: true,
    });
    let output = "",
      error = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("浏览节点超时，请选择更小的目录"));
    }, 60000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error = (error + chunk).slice(-2000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(Error(error || "节点浏览失败"));
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(Error("节点浏览返回格式无效"));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export async function protocolSample(source, dir) {
  if (
    !["opcua", "modbus"].includes(source.kind) ||
    !Number.isFinite(source.pollMs) ||
    source.pollMs < 200
  )
    throw Error("协议类型或采集周期无效");
  validateConnection(source.connection, source.kind);
  const config = {
    ...source.connection,
    protocol: source.kind,
    interval: Math.max(0.5, source.pollMs / 1000),
  };
  const key = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  let session = sessions.get(key);
  if (!session) {
    // Insert before awaiting filesystem work so concurrent tabs share one sampler.
    session = { touched: Date.now(), child: null };
    sessions.set(key, session);
    session.ready = (async () => {
      await fs.mkdir(path.join(dir, "bridges"), { recursive: true });
      const file = path.join(dir, "bridges", key + ".json");
      await fs.writeFile(file, JSON.stringify(config));
      return new Promise((resolve, reject) => {
        const child = spawn(
          python,
          ["-X", "utf8", script, file, "--port", "0", "--managed"],
          { windowsHide: true },
        );
        session.child = child;
        let buffer = "",
          errors = "",
          started = false;
        const timer = setTimeout(() => {
          child.kill();
          reject(Error("桥接启动超时"));
        }, 10000);
        child.stdout.on("data", (chunk) => {
          if (started) return;
          buffer += chunk;
          const index = buffer.indexOf("\n");
          if (started || index < 0) return;
          try {
            const { port } = JSON.parse(buffer.slice(0, index));
            if (!Number.isInteger(port) || port <= 0) throw Error();
            started = true;
            clearTimeout(timer);
            resolve(port);
          } catch {
            child.kill();
            reject(Error("桥接启动返回格式无效"));
          }
        });
        child.stderr.on("data", (chunk) => {
          errors = (errors + chunk).slice(-2000);
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
          if (sessions.get(key) === session) sessions.delete(key);
        });
        child.on("exit", () => {
          clearTimeout(timer);
          if (sessions.get(key) === session) sessions.delete(key);
          if (!started)
            reject(Error(errors || "桥接已退出，请检查 Python 依赖"));
        });
      });
    })();
    session.ready.catch(() => {
      if (sessions.get(key) === session) sessions.delete(key);
    });
  }
  session.touched = Date.now();
  const port = await session.ready;
  const response = await fetch("http://127.0.0.1:" + port + "/snapshot", {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error("协议连接建立中或已中断，请稍后读取");
  return response.json();
}

const cleanup = setInterval(() => {
  for (const [key, session] of sessions) {
    if (Date.now() - session.touched > 60000) {
      session.child?.kill();
      sessions.delete(key);
    }
  }
}, 10000);
cleanup.unref();
process.on("exit", () => {
  for (const session of sessions.values()) session.child?.kill();
});
