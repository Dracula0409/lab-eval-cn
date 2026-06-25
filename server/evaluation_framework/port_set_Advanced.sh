#!/bin/bash

#=== start setting the port $1 ================

sudo sysctl -w net.ipv4.ip_local_port_range="$1 $1"

### this is the sudo command

read  -a arr <<< "$(cat /proc/sys/net/ipv4/ip_local_port_range)"

if [[ "${arr[0]}" == "$1" && "${arr[0]}" == "${arr[1]}" ]];then
	echo -e "\033[32mport set { OK } suucessfully\033[0m <==="
	exit 0
else
	echo -e "\033[31mPORT SET { NOT }\033[0m"
	exit 1
fi


