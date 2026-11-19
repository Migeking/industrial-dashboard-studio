"""Read-only industrial snapshot bridge. Python 3.12, asyncua 1.1, pymodbus 2.5."""
import argparse
import asyncio
import json
import math
import os
import struct
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

def stamp():
    return datetime.now(timezone.utc).isoformat()

def point(tag, value=None, quality="bad", source_time=None, reason=None):
    if isinstance(value, float) and not math.isfinite(value):
        quality = "bad"
        value = None
        reason = "invalid-number"
    return {"id": tag["id"], "label": tag.get("label", tag["id"]), "kind": tag["kind"],
            "unit": tag.get("unit", ""), "value": value if quality == "good" else None,
            "raw": value, "quality": quality, "reason": reason,
            "timestamp": source_time.isoformat() if source_time else None,
            "receivedAt": stamp()}

async def browse(config):
    from asyncua import Client, ua
    client = Client(config["endpoint"], timeout=10)
    if os.getenv("STUDIO_UA_USER"):
        client.set_user(os.environ["STUDIO_UA_USER"])
        client.set_password(os.environ.get("STUDIO_UA_PASSWORD", ""))
    async with client:
        parent = client.get_node(config.get("nodeId") or "i=85")
        children = await parent.get_children()
        result = []
        offset = max(0, int(config.get("offset", 0)))
        for child in children[offset:offset+100]:
            node_class = await child.read_node_class()
            name = (await child.read_display_name()).Text
            item = {"nodeId": child.nodeid.to_string(), "label": name,
                    "folder": node_class == ua.NodeClass.Object}
            if node_class == ua.NodeClass.Variable:
                dtype = await child.read_data_type_as_variant_type()
                item["dataType"] = dtype.name
                rank = await child.read_value_rank()
                if rank == -1:
                    if dtype == ua.VariantType.Boolean:
                        item["kind"] = "boolean"
                    elif dtype in [ua.VariantType.SByte, ua.VariantType.Byte,
                                   ua.VariantType.Int16, ua.VariantType.UInt16,
                                   ua.VariantType.Int32, ua.VariantType.UInt32,
                                   ua.VariantType.Float, ua.VariantType.Double]:
                        item["kind"] = "number"
                    elif dtype == ua.VariantType.String:
                        item["kind"] = "text"
            result.append(item)
        return {"nodes": result, "total": len(children),
                "nextOffset": offset+100 if offset+100 < len(children) else None}

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

MODBUS_REGISTER_FORMATS = {"uint16": "H", "int16": "h", "uint32": "I", "int32": "i", "float32": "f"}
MODBUS_READ_LIMITS = {1: 2000, 2: 2000, 3: 125, 4: 125}


@dataclass
class ModbusRead:
    function: int
    start: int
    end: int
    points: list[tuple[int, dict, int]]


def plan_modbus_reads(tags):
    plan = []
    ordered = sorted(enumerate(tags), key=lambda item: (item[1]["function"], item[1]["address"]))
    for index, tag in ordered:
        function, start = tag["function"], tag["address"]
        if function not in MODBUS_READ_LIMITS:
            raise ValueError("Only read function codes 1 through 4 are supported")
        width = 1 if function <= 2 else struct.calcsize(">" + MODBUS_REGISTER_FORMATS[tag["format"]]) // 2
        end = start + width
        entry = (index, tag, width)
        block = plan[-1] if plan else None
        if block and block.function == function and start <= block.end and end - block.start <= MODBUS_READ_LIMITS[function]:
            block.end = max(block.end, end)
            block.points.append(entry)
        else:
            plan.append(ModbusRead(function, start, end, [entry]))
    return plan


def decode_modbus_registers(tag, registers):
    raw = b"".join(value.to_bytes(2, "big") for value in registers)
    expected = "ABCD"[:len(raw)]
    order = tag.get("order", expected)
    if sorted(order) != list(expected):
        raise ValueError("Invalid byte order")
    canonical = bytes(raw[order.index(char)] for char in expected)
    return struct.unpack(">" + MODBUS_REGISTER_FORMATS[tag["format"]], canonical)[0]


def modbus_rows(client, config, plan):
    from pymodbus.exceptions import ModbusIOException

    methods = {1: client.read_coils, 2: client.read_discrete_inputs,
               3: client.read_holding_registers, 4: client.read_input_registers}
    rows = [None] * len(config["points"])
    next_plan = []

    def read(block):
        quantity = block.end - block.start
        reply = methods[block.function](block.start, quantity, unit=config["unitId"])
        if isinstance(reply, ModbusIOException):
            raise ConnectionError(str(reply))
        if reply.isError():
            code = getattr(reply, "exception_code", None)
            if code in (2, 3) and len(block.points) > 1:
                # Some devices reject a range or cap reads below the protocol limit.
                middle = len(block.points) // 2
                for entries in (block.points[:middle], block.points[middle:]):
                    start = entries[0][1]["address"]
                    end = max(tag["address"] + width for _, tag, width in entries)
                    read(ModbusRead(block.function, start, end, entries))
                return
            reason = {2: "protocol-address", 3: "protocol-request"}.get(code)
            for index, tag, _ in block.points:
                rows[index] = point(tag, reason=reason)
        else:
            bits = block.function <= 2
            values = reply.bits if bits else reply.registers
            if len(values) < quantity:
                raise ConnectionError("Modbus response is shorter than the requested range")
            for index, tag, width in block.points:
                offset = tag["address"] - block.start
                value = bool(values[offset]) if bits else decode_modbus_registers(tag, values[offset:offset + width])
                valid = tag.get("rawMin", -math.inf) <= value <= tag.get("rawMax", math.inf)
                rows[index] = point(tag, value, "good" if valid else "bad",
                                    reason=None if valid else "out-of-range")
        next_plan.append(block)

    for block in plan:
        read(block)
    return rows, next_plan


async def modbus_samples(config, publish, active):
    from pymodbus.client.sync import ModbusTcpClient
    client = ModbusTcpClient(config["host"], port=config.get("port", 502), timeout=2, retries=0)
    try:
        plan = plan_modbus_reads(config["points"])
        while active():
            rows, plan = await asyncio.to_thread(modbus_rows, client, config, plan)
            publish(rows)
            await asyncio.sleep(config.get("interval", 2))
    finally:
        client.close()

async def run(config, port):
    # Validate the selected dependency before announcing an HTTP listener.
    if config["protocol"] == "opcua":
        import asyncua
    else:
        import pymodbus.client.sync
    tags = config["points"]
    if not tags or len({t["id"] for t in tags}) != len(tags):
        raise ValueError("Provide distinct point IDs")
    if config.get("interval", 2) < 0.5:
        raise ValueError("Minimum bridge interval is 0.5 seconds")
    protocol = config["protocol"]
    sample = {"points": [point(t) for t in tags], "status": "connecting"}
    last_sample = None
    def publish(rows, status="connected"):
        nonlocal sample, last_sample
        now = time.monotonic()
        measured = round((now - last_sample) * 1000) if status == "connected" and last_sample is not None else None
        last_sample = now if status == "connected" else None
        sample = {"protocol": protocol, "points": rows, "status": status, "receivedAt": stamp(),
                  "configuredPollMs": round(config.get("interval", 2) * 1000), "sampleIntervalMs": measured}
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
    print(json.dumps({"port": server.server_port}), flush=True)
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
    parser.add_argument("config", type=Path, nargs="?")
    parser.add_argument("--port", type=int, default=8101)
    parser.add_argument("--browse", action="store_true")
    parser.add_argument("--managed", action="store_true")
    args = parser.parse_args()
    if args.managed:
        def parent_lifetime():
            sys.stdin.read()
            os._exit(0)
        threading.Thread(target=parent_lifetime, daemon=True).start()
    if args.browse:
        print(json.dumps(asyncio.run(browse(json.load(sys.stdin))), ensure_ascii=False))
    else:
        asyncio.run(run(json.loads(args.config.read_text(encoding="utf-8-sig")), args.port))
