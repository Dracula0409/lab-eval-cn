#!/bin/bash


function iptohex()
{
	# the ip address produced by this function is in little endian format
	# 
	finalIP=""   
        if [[ $# == 0 ]];then
                #echo "NOT ENOUGH ARGUMENTS"
                #echo "EXPECTED : iptohex <x.x.x.x>"
                #return 0
		echo -n "NO"
        fi

        IFS='.' read -a octact <<< "$1"
	
	IFS=':' read -a ftemp <<< "${octact[3]}"

        #echo "${octact[@]}"
	#echo "$ftemp"

	### Reassigning the values

	octact[3]="${ftemp[0]}"   		# the last octact is reassigned with the last octact(removed port)
	theport="${ftemp[1]}"     		# "theport" variable holds the port in decimal
	hexport=$(printf "%04X" "$theport") 	# "hexport" holds the port number in hexadecimal value with width 4


	for i in ${octact[@]};
	do
		finalIP="$(printf "%02X" "$i")${finalIP}"
	done


	finalIP="${finalIP}:${hexport}"
		
	echo -n "$finalIP"
}

function PORT_AVAIL()
{
        # $1 protocol
        # $2 PORT
        # $3 option

	declare -a PS

        #echo -e "=============== PORT AVIALABILITY ============\n\n"

	hexPort=$(printf "%04X" "$2")
	#echo "checking in the protocol $1 for the port : $2($hexPort)"
	selectedContent=$(cat /proc/net/"$1" | grep ":$hexPort ")


	#echo "$selectedContent"
	
	if [[ "$selectedContent" == "" ]];then
		#echo "THE PORT $2 IS COMPLETELY FREE"
		echo -n "0"
	fi

	declare -i i=0
	declare -i COUNT=0

	while IFS= read -r line;
	do	
		#echo "$line" | awk '{printf $2}'
		
		#echo "$line" | awk '{printf $3}'

		PS[$i]=$(echo "$line" | awk '{printf $4}')
                #echo  "${PS[$i]}"
		
		if [[ "${PS[$i]}" == "0A" ]];then
			#echo "THE PORT IS FOUND { LISTENING } BY ANOTHER APPLICATION"
			#echo "EXITING WITH THE STATUS CODE OF :301"
			echo -n "0A"
			return 0
		elif [[ "${PS[$i]}" == "01" ]];then
			#echo "THE PORT IS FOUND HAVING AN { ESTABLISED } CONNECTION"
			echo -n "01"
			return 0
		elif [[ "${PS[$i]}" == "06" ]];then
			echo -n "06" 
			return 
		elif [[ "${PS[$i]}" == "05" ]];then
			#echo "THE IS IN A TIME_WAIT STATE"
			echo -n "05"
			return 
		elif [[ "$PS[$i]" == "08" ]];then
			continue
		else
			continue
		fi


	done <<< "$selectedContent"
	
	echo -e -n "${PS[0]}"


	#echo "${selectedContentArray[1]}"	
			
    
}

function TIME_WAIT()
{
	TheHexContents=$(cat /proc/net/tcp)

	echo -e "\n\n========= TIME WAIT ===========\n"

	echo "$TheHexContents"

	UserHexContents=$(echo "$TheHexContents" | grep "$(echo "$UID")")

	echo "======================="
	echo "$UserHexContents"
	while read -r single_hex;
	do
		pendingStatus=$(echo -n "$single_hex" | awk '{print $7}')
		if [[ "$pendingStatus" == "05" || "$pendingStatus" == "06" ]];then
			return 1
		fi
	done <<< "$UserHexContent"
}

