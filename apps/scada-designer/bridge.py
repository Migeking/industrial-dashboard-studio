"""Read-only industrial snapshot bridge. Python 3.12, asyncua 1.1, pymodbus 2.5."""
import argparse
import asyncio
import json
import math
import os
import struct
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

def stamp():
    return datetime.now(timezone.utc).isoformat()

def point(tag, value=None, quality="bad", source_time=None):
    if isinstance(value, float) and not math.isfinite(value):
        quality = "bad"
    return {"id": tag["id"], "label": tag.get("label", tag["id"]), "kind": tag["kind"],
            "unit": tag.get("unit", ""), "value": value if quality == "good" else None,
            "quality": quality, "timestamp": source_time.isoformat() if source_time else None,
            "receivedAt": stamp()}

async def ua_samples(config, publish, active):
    from asyncua import Client
    client = Client(config["endpoint"], timeout=config.get("timeout", 30))
    if os.getenv("STUDIO_UA_USER"):
        client.set_user(os.environ["STUDIO_UA_USER"])
        client.set_password(os.environ.get("STUDIO_UA_PASSWORD", ""))
    async with client:
        tags = config["points"]
        nodes = [client.get_node(t["nodeId"]) for t in tags]
        while active():
            from asyncua import ua
            values = await client.read_attributes(nodes, ua.AttributeIds.Value)
            rows = [point(t, v.Value.Value if v.Value else None,
                          "good" if v.StatusCode.is_good() else "bad", v.SourceTimestamp)
                    for t, v in zip(tags, values)]
            publish(rows)
            await asyncio.sleep(config.get("interval", 2))

def modbus_rows(client, config):
    methods = {1: client.read_coils, 2: client.read_discrete_inputs,
               3: client.read_holding_registers, 4: client.read_input_registers}
    formats = {"uint16": "H", "int16": "h", "uint32": "I", "int32": "i", "float32": "f"}
    rows = []
    for tag in config["points"]:
        fc = tag["function"]
        if fc not in methods:
            raise ValueError("Only read function codes 1 through 4 are supported")
        size = 1 if fc <= 2 else struct.calcsize(">"+formats[tag["format"]])//2
        reply = methods[fc](tag["address"], size, unit=config["unitId"])
        from pymodbus.exceptions import ModbusIOException
        if isinstance(reply, ModbusIOException):
            raise ConnectionError(str(reply))
        if reply.isError():
            rows.append(point(tag))
            continue
        if fc <= 2:
            value = bool(reply.bits[0])
        else:
            raw = b"".join(v.to_bytes(2, "big") for v in reply.registers)
            order = tag.get("order", "ABCD"[:len(raw)])
            expected = "ABCD"[:len(raw)]
            if sorted(order) != list(expected):
                raise ValueError("Invalid byte order")
            canonical = bytes(raw[order.index(char)] for char in expected)
            value = struct.unpack(">"+formats[tag["format"]], canonical)[0]
        valid = tag.get("rawMin", -math.inf) <= value <= tag.get("rawMax", math.inf)
        row = point(tag, value, "good" if valid else "bad")
        row["raw"] = value
        rows.append(row)
    return rows

async def modbus_samples(config, publish, active):
    from pymodbus.client.sync import ModbusTcpClient
    client = ModbusTcpClient(config["host"], port=config.get("port", 502), timeout=2, retries=0)
    try:
        while active():
            rows = await asyncio.to_thread(modbus_rows, client, config)
            publish(rows)
            await asyncio.sleep(config.get("interval", 2))
    finally:
        client.close()

async def run(config, port):
    tags = config["points"]
    if not tags or len({t["id"] for t in tags}) != len(tags):
        raise ValueError("Provide distinct point IDs")
    if config.get("interval", 2) < 0.5:
        raise ValueError("Minimum bridge interval is 0.5 seconds")
    protocol = config["protocol"]
    sample = {"points": [point(t) for t in tags], "status": "connecting"}
    def publish(rows, status="connected"):
        nonlocal sample
        sample = {"protocol": protocol, "points": rows, "status": status, "receivedAt": stamp()}
    last_request = time.monotonic()
    def active():
        return time.monotonic() - last_request < 45
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/snapshot":
                self.send_error(404)
                return
            nonlocal last_request
            last_request = time.monotonic()
            snapshot = sample
            data = json.dumps(snapshot, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(200 if snapshot["status"] == "connected" else 503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    sampler = {"opcua": ua_samples, "modbus": modbus_samples}[protocol]
    try:
        while True:
            try:
                if not active():
                    await asyncio.sleep(0.5)
                    continue
                await sampler(config, publish, active)
            except (OSError, asyncio.TimeoutError, ConnectionError, RuntimeError) as err:
                print(type(err).__name__, str(err), flush=True)
            except Exception as err:
                # OPC UA session errors have library-specific classes.
                if isinstance(err, (ValueError, KeyError, TypeError)):
                    raise
                print(type(err).__name__, str(err), flush=True)
            publish([point(t) for t in tags], "offline")
            await asyncio.sleep(3)
    finally:
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--port", type=int, default=8101)
    args = parser.parse_args()
    asyncio.run(run(json.loads(args.config.read_text(encoding="utf-8-sig")), args.port))
