#!/usr/bin/env python3
import sys
import re
import json
import csv
import string
import struct


def print_c(content, status):

    print(content, " : " , end="")

    if(status == "correct"):
        print("\033[42m  Passed  \033[0m")
    else:
        print("\033[41m  Failed  \033[0m")


# Validate arguments
if len(sys.argv) != 4:
    print("Usage: python3 evaluation.py <student_id> <question_id> <testcase_id>")
    sys.exit(1)

student_id = sys.argv[1]
question_id = sys.argv[2]
testcase_id = sys.argv[3]

PRINTABLE_HEX = {format(ord(c), '02x') for c in string.printable if c not in '\r\n\t\x0b\x0c'}

# ----------- Parse Port Mappings -----------

def parse_ports():
    ip_to_logical = {}

    # Client ports
    with open("clientPorts.sh") as f:
        for line in f:
            line = line.strip()
            match = re.match(r'CLIENT_PORT\[(\d+)\]=(\d+)', line)
            if match:
                index, port = match.groups()
                ip = f"127.0.0.1.{port}"
                ip_to_logical[ip] = f"client{int(index)+1}"

    # Server ports
    with open("serverPorts.sh") as f:
        for line in f:
            line = line.strip()
            match = re.match(r'SERVER_PORT\[(\d+)\]=(\d+)', line)
            if match:
                index, port = match.groups()
                ip = f"127.0.0.1.{port}"
                ip_to_logical[ip] = f"server{int(index)+1}"

    return ip_to_logical

ip_to_logical = parse_ports()

def get_logical(ip):
    return ip_to_logical[ip]

def normalize_logical_tag(tag):
    """Map short tags (c1, s1, p1) to port-map names (client1, server1)."""
    tag = tag.strip()
    if len(tag) >= 2 and tag[0] == 'c' and tag[1:].isdigit():
        return f"client{tag[1:]}"
    if len(tag) >= 2 and tag[0] == 's' and tag[1:].isdigit():
        return f"server{tag[1:]}"
    if len(tag) >= 2 and tag[0] == 'p' and tag[1:].isdigit():
        return f"pclient{tag[1:]}"
    return tag

def normalize_ip_port(ip_str):
    if ':' in ip_str:
        ip, port = ip_str.split(':')
        return f"{ip}.{port}"
    return ip_str

# ----------- Load Testcases and Extract Target One -----------
with open("testcases.json") as f:
    testcases = json.load(f)

if question_id not in testcases or testcase_id not in testcases[question_id]:
    print(f"Testcase {question_id}.{testcase_id} not found in testcases.json")
    sys.exit(1)

pairs = testcases[question_id][testcase_id]

# ----------- Parse hex_transfer.log -----------
entries = []
with open("hex_transfer.log") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        parts = line.split(",")
        if len(parts) != 4:
            continue
        raw_src, raw_dst, length, hex_payload = parts
        try:
            src = normalize_ip_port(raw_src.strip())
            dst = normalize_ip_port(raw_dst.strip().rstrip(":"))
        except ValueError:
            continue
        try:
            src_id = get_logical(src)
            dst_id = get_logical(dst)
        except KeyError:
            continue
        length = int(length.strip())
        payload = hex_payload.strip().replace(" ", "").lower()

        if "client" in src_id:
            direction = "c->s"
        elif "server" in src_id:
            direction = "s->c"
        else:
            continue

        entries.append((src_id, dst_id, direction, payload))
        #print(f"^{entries}^")

# ----------- Convert testcase data to HEX (old behaviour) -----------
def to_hex_variants(data):
    if isinstance(data, str):
        # Old behaviour: treat as UTF-8 string
        print("original data: ", data)
        hex_str = data.encode('utf-8').hex()
        print("Hex data: ", hex_str)
        return (hex_str, hex_str)
    elif isinstance(data, int):
        return (
            struct.pack('>i', data).hex(),
            struct.pack('<i', data).hex()
        )
    elif isinstance(data, float):
        return (
            struct.pack('>d', data).hex(),
            struct.pack('<d', data).hex()
        )
    elif isinstance(data, bool):
        return (
            struct.pack('>i', 1 if data else 0).hex(),
            struct.pack('<i', 1 if data else 0).hex()
        )
    else:
        raise TypeError(f"Unsupported data type: {type(data)}")

# ----------- New: compare hex with read/skip pattern -----------

def compare_hex_with_pattern(actual_hex, expected_hex, pattern):
    """
    actual_hex   : hex string (no 0x, no spaces, lowercase)
    expected_hex : hex string (no 0x, no spaces, lowercase)
    pattern      : list of ints, e.g. [5, -5, 4]

    Positive n  -> compare next n bytes.
    Negative -n -> skip next n bytes.
    """
    byte_pos = 0  # in bytes, not characters

    for p in pattern:
        if p == 0:
            # Should not normally appear here (0 is reserved for "use old behaviour")
            continue

        n = abs(p)
        start = byte_pos * 2
        end = (byte_pos + n) * 2

        # Not enough bytes in either expected or actual -> mismatch
        if len(actual_hex) < end or len(expected_hex) < end:
            return False

        if p > 0:
            # Must match exactly for this chunk
            if actual_hex[start:end] != expected_hex[start:end]:
                return False

        # Move past these bytes (read or skipped)
        byte_pos += n

    # Trailing bytes are ignored; only pattern-covered region matters
    return True

# ----------- Evaluation Logic -----------
row = [student_id, f"{question_id}.{testcase_id}"]

# Initialize dynamic columns (2 per communication)
for _ in pairs:
    row.append("fail")
    row.append("wrong")

for idx, item in enumerate(pairs):
    # Determine pattern (read/skip list) and communication dict
    # Supported forms:
    #   1) { "client1_to_server1": value }              -> pattern = [0]
    #   2) [[0], { "client1_to_server1": value }]       -> pattern = [0]
    #   3) [[5,-5], { "client1_to_server1": "0x..." }]  -> pattern = [5,-5]
    pattern = [0]
    comm = None
    
    if isinstance(item, dict):
        comm = item
    elif isinstance(item, list) and len(item) == 2 and isinstance(item[0], list) and isinstance(item[1], dict):
        pattern, comm = item
    else:
        print(item)
        print(f"Invalid testcase entry at index {idx}: {item}")
        continue

    if len(comm) != 1:
        print(f"Invalid communication entry in testcase: {comm}")
        continue

    key, expected_data = next(iter(comm.items()))
    src_raw, dst_raw = key.split("_to_")
    src_logical = normalize_logical_tag(src_raw)
    dst_logical = normalize_logical_tag(dst_raw)
    direction = "c->s" if "client" in src_logical or "pclient" in src_logical else "s->c"

    for e_src, e_dst, e_dir, e_data in entries:
        if e_dir == direction and e_src == src_logical and e_dst == dst_logical:
            actual = e_data.lower()
            matched = False

            # --------- CASE 1: pattern [0] -> old behaviour (int/float/double/string/etc.) ---------
            if pattern == [0]:
                try:
                    hex_big, hex_little = to_hex_variants(expected_data)
                except Exception as e:
                    print(f"Hex conversion failed for data {expected_data}: {e}")
                    continue

                if isinstance(expected_data, (int, float, bool)):
                    matched = (actual == hex_big) or (actual == hex_little)
                elif isinstance(expected_data, str):
                    # Original "string with printable-next-byte" heuristic
                    #print("testcase data: ", expected_data)
                    #print("obtained data: ", actual)
                    if actual.startswith(hex_big):
                        next_index = len(hex_big)
                        if next_index + 2 <= len(actual):
                            next_byte = actual[next_index:next_index+2]
                            if next_byte in PRINTABLE_HEX:
                                matched = False
                            else:
                                matched = True
                        else:
                            matched = True
                    elif actual.startswith(hex_little):
                        next_index = len(hex_little)
                        if next_index + 2 <= len(actual):
                            next_byte = actual[next_index:next_index+2]
                            if next_byte in PRINTABLE_HEX:
                                matched = False
                            else:
                                matched = True
                        else:
                            matched = True

            # --------- CASE 2: pattern with reads/skips -> struct/array hex path ---------
            else:
                # For struct/array checks we expect a raw hex literal like "0x68656C6C6F0000000000"
                if isinstance(expected_data, str) and expected_data.startswith(("0x", "0X")):
                    #print("obtained :", actual)
                    #print("expected :", expected_data)
                    expected_hex = expected_data[2:].replace(" ", "").lower()
                    matched = compare_hex_with_pattern(actual, expected_hex, pattern)
                else:
                    print(f"Pattern {pattern} used with non-hex data {expected_data}; "
                          f"expected a string like '0x...'")
                    matched = False

            # Mark that we at least saw the packet
            row[2 + 2*idx] = "ok"
            if matched:
                row[2 + 2*idx + 1] = "correct"
                print_c(testcase_id, "correct")
                break
            else:
                print_c(testcase_id, "wrong")

# ----------- Append to evaluated.csv -----------
eval_file = f"{student_id}_evaluated.csv"

with open(eval_file, "a", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(row)

print(f"Appended result for {question_id}.{testcase_id} to {eval_file}")
