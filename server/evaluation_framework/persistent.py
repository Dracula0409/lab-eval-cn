import sys
import re
import csv
from collections import defaultdict

# ------------ Argument Validation ------------
if len(sys.argv) != 4:
    print("Usage: python3 persistent.py <student_id> <threshold> <expected>")
    sys.exit(1)

student_id = sys.argv[1]
threshold = int(sys.argv[2])  # Max allowed reconnects before declaring non-persistent
expected = sys.argv[3].lower()  # "persistent" or "non-persistent"

# ------------ IP to Logical Mapping ------------
def parse_ports():
    ip_to_logical = {}

    with open("clientPorts.sh") as f:
        for line in f:
            match = re.match(r'CLIENT_PORT\[(\d+)\]=(\d+)', line.strip())
            if match:
                idx, port = match.groups()
                ip_to_logical[f"127.0.0.1.{port}"] = f"client{int(idx)+1}"

    with open("serverPorts.sh") as f:
        for line in f:
            match = re.match(r'SERVER_PORT\[(\d+)\]=(\d+)', line.strip())
            if match:
                idx, port = match.groups()
                ip_to_logical[f"127.0.0.1.{port}"] = f"server{int(idx)+1}"

    return ip_to_logical

ip_to_logical = parse_ports()

def format_ip_port(addr):
    ip, port = addr.split(":")
    ip = ip.replace("0.0.0.0", "127.0.0.1")
    return f"{ip}.{port}"

rows_to_append = []

# ------------ Parse flags.log for TCP Reconnects ------------
sessions = defaultdict(list)
pattern = re.compile(r"(\d+\.\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+\.\d+):\s+\[(.+?)\]")

with open("flags.log") as f:
    for line in f:
        line = line.strip().strip(",")
        if not line:
            continue
        match = pattern.match(line)
        if match:
            src, dst, flag = match.groups()
            dst = dst.rstrip(":")
            key = tuple(sorted((src, dst)))
            sessions[key].append(flag)

# ------------ Determine Persistence Status ------------
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

    actual_status = "persistent" if reconnects <= threshold else "non-persistent"
    verdict = "correct" if actual_status == expected else "wrong"

    src_logical = ip_to_logical[src]
    dst_logical = ip_to_logical[dst]

    results.append([src_logical, dst_logical, actual_status, verdict])

# ------------ Write Output to <student_id>_status.log ------------
with open(f"{student_id}_status.log", "w") as out:
    for row in results:
        out.write(",".join(row) + "\n")

print(f"{expected} state check results appended to {student_id}_status.csv")
