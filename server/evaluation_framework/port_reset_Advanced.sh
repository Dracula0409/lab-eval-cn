#!/bin/bash

#=== start REsetting the port range ================

sudo sysctl -w net.ipv4.ip_local_port_range="32768 60999"

### this is the sudo command

read  -a arr <<< "$(cat /proc/sys/net/ipv4/ip_local_port_range)"

if [[ "${arr[0]}" == "32768" && "${arr[1]}" == "60999" ]];then
	echo -e "\033[32mport REset { OK } sucessfully\033[0m <==="
	exit 0
elif [[ $((${arr[1]} - ${arr[0]})) -gt 1000 ]];then
	echo -e "\033[33mport RESETTING"
	exit 1
else
	echo -e "\033[31m FATAL ERROR : PORT RESET { NOT } \033[0m"
	exit 2
fi


