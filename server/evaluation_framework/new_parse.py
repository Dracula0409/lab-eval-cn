import sys
import re
import json
import csv
import struct
from collections import defaultdict

# Validate arguments
if len(sys.argv) != 4:
    print("Usage: python3 parse.py <question_id> <student_id> <persistence_flag_or_threshold>")
    sys.exit(1)

question_id = sys.argv[1]
student_id = sys.argv[2]
max_reconnects = int(sys.argv[3])  # 0 = skip, >0 = threshold

US = chr(31)

# ----------- Parse Port Mappings -----------
def parse_ports(sh_path="clientPorts.sh"):
    ip_to_logical = {}
    with open(sh_path) as f:
        for line in f:
            line = line.strip()
            match_client = re.match(r'CLIENT_PORT\[(\d+)\]=(\d+)', line)
            match_proxy = re.match(r'PROXY_PORT\[(\d+)\]=(\d+)', line)
            match_server = re.match(r'SERVER_PORT\[(\d+)\]=(\d+)', line)
            match_pserver = re.match(r'PROXY_SERVER_PORT\[(\d+)\]=(\d+)', line)

            if match_client:
                index, port = match_client.groups()
                ip = f"127.0.0.1.{port}"
                ip_to_logical[ip] = f"client{int(index)+1}"
            elif match_proxy:
                index, port = match_proxy.groups()
                ip = f"127.0.0.1.{port}"
                ip_to_logical[ip] = f"pclient{int(index)+1}"
            elif match_server:
                index, port = match_server.groups()
                ip = f"127.0.0.1.{port}"
                ip_to_logical[ip] = f"server{int(index)+1}"
            elif match_pserver:
                index, port = match_pserver.groups()
                ip = f"127.0.0.1.{port}"
                ip_to_logical[ip] = f"pserver{int(index)+1}"

    return ip_to_logical

# ----------- Load Mappings & Logs -----------
ip_to_logical = parse_ports("clientPorts.sh")

def get_logical(ip):
    return ip_to_logical[ip]

with open("testcases.json") as f:
    testcases = json.load(f)

# ----------- Updated: Read and Parse New unitsep.log Format -----------

def normalize_ip_port(ip_str):
    # Convert 127.0.0.1:5001 or 127.0.0.1.5001 → 127.0.0.1.5001
    if ':' in ip_str:
        ip, port = ip_str.split(':')
        return f"{ip}.{port}"
    return ip_str

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

        if "client" in src_id or "pclient" in src_id:
            direction = "c->s"
        elif "server" in src_id or "pserver" in src_id:
            direction = "s->c"
        else:
            continue

        entries.append((src_id, dst_id, direction, payload))

# ----------- Convert testcase data to HEX ------------

def to_hex_variants(data):
    import struct
    if isinstance(data, str):
        hex_str = data.encode('utf-8').hex()
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
        # Match 4-byte int (like C/C++) encoding of bool
        return (
            struct.pack('>i', 1 if data else 0).hex(),
            struct.pack('<i', 1 if data else 0).hex()
        )
    else:
        raise TypeError(f"Unsupported data type: {type(data)}")

# ----------- Evaluation Logic -----------
rows = []

if question_id not in testcases:
    print(f"Error: Question ID '{question_id}' not found in testcases.json")
    sys.exit(1)

for testcase, pairs in testcases[question_id].items():
    row = [student_id, f"{question_id}.{testcase}", "fail", "wrong", "fail", "wrong"]

    for key, expected_data in pairs.items():
        src_logical, dst_logical = key.split("_to_")
        direction = "c->s" if "client" in src_logical or "proxy" in src_logical else "s->c"

        for e_src, e_dst, e_dir, e_data in entries:
            if e_dir == direction and e_src == src_logical and e_dst == dst_logical:
                try:
                    hex_big, hex_little = to_hex_variants(expected_data)
                except Exception as e:
                    print(f"Error converting expected data to hex: {e}")
                    continue

                actual = e_data.lower()
                matched = False

                if isinstance(expected_data, (int, float, bool)):
                    matched = (actual == hex_big) or (actual == hex_little)
                elif isinstance(expected_data, str):
                    matched = actual.startswith(hex_big) or actual.startswith(hex_little)

                if direction == "c->s":
                    row[2] = "ok"
                    if matched:
                        row[3] = "correct"
                else:
                    row[4] = "ok"
                    if matched:
                        row[5] = "correct"

    rows.append(row)

# ----------- Save Evaluation CSV -----------
eval_file = f"{student_id}_evaluated.csv"
with open(eval_file, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["student_id", "question.testcase", "c->s_conn", "c->s_data", "s->c_conn", "s->c_data"])
    writer.writerows(rows)

#print(f"Evaluation written to {eval_file}")

# ----------- Persistence Check (Conditional) -----------
if max_reconnects > 0:
    sessions = defaultdict(list)
    pattern = re.compile(r"(\d+\.\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+\.\d+):\s+\[(.+?)\]")

    with open("flags.log") as f:
        lines = [line.strip().strip(",") for line in f if line.strip()]

    for line in lines:
        match = pattern.match(line)
        if match:
            src, dst, flag = match.groups()
            dst = dst.rstrip(':')
            key = tuple(sorted((src, dst)))
            sessions[key].append(flag)

    results = []
    for (src, dst), flags in sessions.items():
        reconnects = 0
        session_open = False

        for flag in flags:
            if "S" in flag:
                if session_open:
                    reconnects += 1
                session_open = True
            elif "F" in flag:
                session_open = False

        status = "NON-PERSISTENT" if reconnects > max_reconnects else "PERSISTENT"

        src_logical = get_logical(src)
        dst_logical = get_logical(dst)
        results.append([src_logical, dst_logical, status, reconnects])

    status_file = f"{student_id}_status.csv"
    with open(status_file, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["source", "destination", "persistence", "reconnections"])
        writer.writerows(results)

    #print(f"Connection status written to {status_file}")

# ----------- TCP LISTEN + ESTABLISHED -----------

def format_ip_port(addr):
    ip, port = addr.split(":")
    ip = ip.replace("0.0.0.0", "127.0.0.1")
    return f"{ip}.{port}"

listen_states = {}
established_states = {}

with open("connectionstatus.log") as f:
    for line in f:
        parts = line.strip().split()
        if len(parts) < 3:
            continue
        src_raw, dst_raw, state = parts

        src_ip = format_ip_port(src_raw)
        dst_ip = format_ip_port(dst_raw)

        if dst_raw == "0.0.0.0:0000":
            try:
                src_logical = get_logical(src_ip)
            except KeyError:
                continue

            if state == "LISTEN":
                listen_states[src_logical] = "listening"
            elif state == "NO":
                listen_states[src_logical] = "not listening"

        else:
            try:
                src_logical = get_logical(src_ip)
                dst_logical = get_logical(dst_ip)
            except KeyError:
                continue

            if "client" in src_logical and "server" in dst_logical:
                key = (src_logical, dst_logical)
            elif "server" in src_logical and "client" in dst_logical:
                key = (dst_logical, src_logical)
            else:
                continue

            if state == "ESTABLISHED":
                established_states[key] = "established"
            elif state == "NO":
                established_states[key] = "not established"

# ----------- Write conn.csv -----------
with open(f"{student_id}_conn.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["server", "status"])
    for entity, status in listen_states.items():
        writer.writerow([entity, status])

    if established_states:
        writer.writerow([])
        writer.writerow(["client", "server", "status"])
        for (client, server), status in established_states.items():
            writer.writerow([client, server, status])

#print(f"Connection summary written to {student_id}_conn.csv")
