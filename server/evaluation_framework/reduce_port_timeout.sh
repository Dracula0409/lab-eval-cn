#!/bin/bash

echo "----------- CHANGING THE TIMEOUT OF THE PORT ----------------"

sudo sysctl -w net.ipv4.tcp_fin_timeout=1
sudo sysctl -w net.ipv4.tcp_tw_reuse=1
sudo sysctl -w net.ipv4.tcp_timestamps=1

if [[ "1" == "$(cat /proc/sys/net/ipv4/tcp_fin_timeout)" && "1" == "$(cat /proc/sys/net/ipv4/tcp_tw_reuse)" && "1" == "$(cat /proc/sys/net/ipv4/tcp_timestamps)" ]];then
	echo -e "\033[32mSETTING THE TIMEOUT SUCESSFUL [ OK ]\033[0m"
	exit 0
else
	echo -e "\033[31mSETTING THE TIMEOUT [ NOT ]\033[0m"
	exit 1
fi


echo ""
