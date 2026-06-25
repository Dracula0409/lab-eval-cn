import sys
import re
import csv


def print_c(content, status):

    print(content, " : " , end="")

    if(status == "correct"):
        print("\033[42m  OK  \033[0m")
    else:
        print("\033[41m  NOT  \033[0m")



# --- Validate input ---
if len(sys.argv) != 2 and len(sys.argv) != 3:
    print("Usage: python3 conn.py <student_id> <expected_state>")
    sys.exit(1)

student_id = sys.argv[1]
expected_state = sys.argv[2].strip().upper()

if expected_state not in ["LISTEN", "ESTABLISHED", "NO"]:
    print("Expected state must be 'LISTEN', 'ESTABLISHED', or 'NO'")
    sys.exit(1)

# --- Parse port mappings ---
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

# --- Read connectionstatus.log ---
with open("connectionstatus.log") as f:
    for line in f:
        parts = line.strip().split()
        if len(parts) < 3:
            continue

        src_raw, dst_raw, state = parts
        state = state.upper()
        src_ip = format_ip_port(src_raw)
        dst_ip = format_ip_port(dst_raw)

        if dst_raw == "0.0.0.0:0000":
            # Server listen check
            try:
                src_logical = ip_to_logical[src_ip]
            except KeyError:
                continue

            actual_status = state.lower()
            correctness = "correct" if state == expected_state else "wrong"
            rows_to_append.append([src_logical, actual_status, correctness])

            print_c(f"server Listening at {src_ip}", correctness)
        else:
            # Client-server connection check
            try:
                src_logical = ip_to_logical[src_ip]
                dst_logical = ip_to_logical[dst_ip]
            except KeyError:
                continue

            if "client" in src_logical and "server" in dst_logical:
                client, server = src_logical, dst_logical
            elif "server" in src_logical and "client" in dst_logical:
                client, server = dst_logical, src_logical
            else:
                continue

            actual_status = state.lower()
            correctness = "correct" if state == expected_state else "wrong"
            rows_to_append.append([client, server, actual_status, correctness])

            print_c(f"{expected_state} connection between {src_ip} and {dst_ip}", correctness)
            
# --- Append to CSV ---
with open(f"{student_id}_conn.csv", "a", newline="") as f:
    writer = csv.writer(f)
    writer.writerows(rows_to_append)

print(f"{expected_state} state check results appended to {student_id}_conn.csv")
