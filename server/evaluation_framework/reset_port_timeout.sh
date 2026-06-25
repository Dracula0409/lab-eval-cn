#!/bin/bash

echo "============== RESETTING THE PORT TIMEOUT ============="

sudo sysctl -w net.ipv4.tcp_fin_timeout=30
sudo sysctl -w net.ipv4.tcp_tw_reuse=0
sudo sysctl -w net.ipv4.tcp_timestamps=1

if [[ "30" == "$(cat /proc/sys/net/ipv4/tcp_fin_timeout)" && "0" == "$(cat /proc/sys/net/ipv4/tcp_tw_reuse)" && "1" == "$(cat /proc/sys/net/ipv4/tcp_timestamps)" ]];then
        echo "SETTING THE TIMEOUT SUCESSFUL [ OK ]"
        exit 0
else
        echo "SETTING THE TIMEOUT [ NOT ]"
        exit 1
fi


echo ""
