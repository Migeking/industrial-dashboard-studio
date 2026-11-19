"""Check the read-only Modbus block plan, decoding and isolated failures."""
import struct
from pathlib import Path
from runpy import run_path
from types import SimpleNamespace

from pymodbus.exceptions import ModbusIOException
from pymodbus.pdu import ExceptionResponse


BRIDGE = Path(__file__).resolve().parents[1] / "apps/scada-designer/bridge.py"
bridge = run_path(str(BRIDGE))
plan_reads = bridge["plan_modbus_reads"]
read_rows = bridge["modbus_rows"]


def tag(id, address, fc=4, format="uint16", **extra):
    return {"id": id, "address": address, "function": fc,
            "kind": "boolean" if fc <= 2 else "number", "format": format, **extra}


def ranges(plan):
    return [(block.function, block.start, block.end - block.start) for block in plan]


class FixtureClient:
    def __init__(self, registers, bits=(), reject=None):
        self.registers = registers
        self.bits = bits
        self.reject = reject
        self.reads = []

    def read_discrete_inputs(self, start, count, unit):
        assert unit == 1
        self.reads.append((2, start, count))
        return SimpleNamespace(bits=self.bits[start:start + count], isError=lambda: False)

    def read_input_registers(self, start, count, unit):
        assert unit == 1
        self.reads.append((4, start, count))
        error = self.reject(start, count) if self.reject else None
        if error:
            return error
        return SimpleNamespace(registers=self.registers[start:start + count], isError=lambda: False)

    read_coils = read_discrete_inputs
    read_holding_registers = read_input_registers


# Avoid gaps and keep full multiword values together at the end of a range.
register_tags = [tag(str(i), i) for i in range(125)]
register_tags += [tag("wide", 124, format="float32"), tag("isolated", 140), tag("holding", 0, fc=3)]
assert ranges(plan_reads(register_tags)) == [(3, 0, 1), (4, 0, 125), (4, 124, 2), (4, 140, 1)]
bit_tags = [tag(str(i), i, fc=2) for i in range(2001)]
assert ranges(plan_reads(bit_tags + [tag("coil", 0, fc=1)])) == [(1, 0, 1), (2, 0, 2000), (2, 2000, 1)]

# Decode in declared point order, including raw boundaries and aliases.
words = struct.unpack(">HH", struct.pack(">f", 38.5))
client = FixtureClient([16000, 3999, 0xfec0, *reversed(words), 0], [True, False, True])
tags = [tag("frequency", 3, format="float32", order="CDAB"),
        tag("off", 1, fc=2), tag("signed", 2, format="int16"),
        tag("invalid-raw", 1, rawMin=4000, rawMax=20000),
        tag("present", 0, fc=2), tag("raw", 0, rawMin=4000, rawMax=20000), tag("alias", 0), tag("zero", 5)]
config = {"unitId": 1, "points": tags}
rows, after = read_rows(client, config, plan_reads(tags))
assert client.reads == [(2, 0, 2), (4, 0, 6)]
assert [row["id"] for row in rows] == [item["id"] for item in tags]
assert [row["value"] for row in rows] == [38.5, False, -320, None, True, 16000, 16000, 0]
assert rows[3]["raw"] == 3999 and rows[3]["reason"] == "out-of-range"
assert all(rows[i]["quality"] == "good" for i in range(len(rows)) if i != 3)

# An invalid address affects only its own point. Subsequent scans use the split plan.
tags = [tag(str(i), i) for i in range(4)]
config["points"] = tags
client = FixtureClient([10, 20, 30, 40],
    reject=lambda start, count: ExceptionResponse(4, 2) if start <= 1 < start + count else None)
rows, after = read_rows(client, config, plan_reads(tags))
assert [row["value"] for row in rows] == [10, None, 30, 40]
assert rows[1]["quality"] == "bad" and rows[1]["reason"] == "protocol-address"
assert ranges(after) == [(4, 0, 1), (4, 1, 1), (4, 2, 2)]
client.reads.clear()
repeated, after = read_rows(client, config, after)
assert client.reads == ranges(after)
assert [row["quality"] for row in repeated] == ["good", "bad", "good", "good"]

# A device may cap a read below the protocol limit. Preserve all values in smaller blocks.
client = FixtureClient([10, 20, 30, 40],
    reject=lambda start, count: ExceptionResponse(4, 3) if count > 2 else None)
rows, after = read_rows(client, config, plan_reads(tags))
assert [row["value"] for row in rows] == [10, 20, 30, 40]
assert ranges(after) == [(4, 0, 2), (4, 2, 2)]

# Transport failures and truncated frames fail the scan without repeated range probes.
for fixture in (FixtureClient([], reject=lambda start, count: ModbusIOException("timed out")),
                FixtureClient([10, 20])):
    try:
        read_rows(fixture, config, plan_reads(tags))
    except ConnectionError:
        assert fixture.reads == [(4, 0, 4)]
    else:
        raise AssertionError("Expected a failed Modbus scan")

print("PASS: contiguous read limits, multiword decoding, point order, partial failures and disconnect handling")
