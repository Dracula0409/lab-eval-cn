#!/bin/bash

source lib.sh

TCPDUMP_PID=0
TCPDUMP_FILENAME=""


# is_print="false"
# 
# function echo()
# {
# 	builtin echo "$@"
# }

function START_TCPDUMP()
{
	if [[ $# -lt 3 ]];then
		echo -e "error at line : $LINENO in $0"
		echo "EXPECTED : START_TCPDUMP <protocol> <port> <output_file_name>"
		#CLEAR_ALL
		END_TCPDUMP
		exit 105
	fi

	### IF THE ARGUMENTS ARE PROVIDED CORRECTLY 
	### THE TCPDUMP WORKS PERFECTLY WITHOUT ANY ISSUSE
	### IT IS THE RESPONSIBILITY OF THE SCRIPTER TO 
	### REMEMBER THE NAMES OF THE FILES THEY ARE ASSIGNING
	 
	> $3
	tcpdump --immediate-mode -i lo $1 "port $2" -nn -A -w "$3" 2>/dev/null &
	TCPDUMP_PID=$!
	#=- echo "the pid of tcpdump is : $TCPDUMP_PID"
	
	TCPDUMP_FILENAME="$3"
}
function FLUSH_TCPDUMP() 
{
	echo ""
	# This function only parses the output from the transfer.hex
	# into required hex-content.log without killing the tcpdump

# NOTE : Running this function will flushes existing contents of the
#	 "transfer.log" , "transfer.hex". After parsing into these 
#	 files, "the transfer.pcap" will also be flushed completely.
#	 It is the responsibility of the programer to make sure the 
#	 programs running in the coproc send data cronologiacally. 

		>transfer.log
        >transfer.hex

        #=- echo "parsing contents of $TCPDUMP_FILENAME  TO transfer.log && hex_transfer.log  "
        tcpdump -nn -A -r $TCPDUMP_FILENAME > transfer.log  2>/dev/null
        tcpdump -nn -r $TCPDUMP_FILENAME -xx > transfer.hex 2>/dev/null
}

function END_TCPDUMP()
{
	#=- echo "===>KILLING TCPDUMP"

	if [[ $TCPDUMP_PID == 0 ]];then
		#=- echo -e "\033[36mTCPDUMP IS NOT STARTED\033[0m"
		return 0
	fi

	#killing the tcpdump process
	kill -2 $TCPDUMP_PID 2>/dev/null
	
	>transfer.log
	>transfer.hex

	sleep 1
	#=- echo "parsing contents of $TCPDUMP_FILENAME  TO transfer.log && hex_transfer.log  "
	tcpdump -nn -A -r $TCPDUMP_FILENAME > transfer.log  2>/dev/null
	tcpdump -nn -r $TCPDUMP_FILENAME -xx > transfer.hex 2>/dev/null
	
	#=- echo "TCPDUMP KILLED SUCCESSFULLY<==="
}

function EVALUATE()
{
	#
	# $1 PROTOCOL
	# $2 testcase number start range
	# $3 testcase number end range

	if [[ $# -lt 2 ]];then
		echo "WORNG USAGE OF EVALUATE "
		echo "EXPECTED : EVALUATE <protocol> <tesatcase_start> <testcase_end>"
		exit 0
	fi

	bash modi_2.sh "$Qi" "$1" 

	sleep 1
	#=- echo "started evaluating and correction"
	
	if [[ $# -eq 2 ]];then

		echo -e "\033[34m-------------- TEST CASE $2 -------------\033[0m"
		python3 new_evaluation.py "$student_id" "${Qi}" "testcase$2" 
	
	elif [[ $# -eq 3 ]];then
		
		local counti=0

		for (( counti=$2 ; counti<=$3 ; counti++ ));
		do
			echo -e "\033[34m-------------- TEST CASE $counti -------------\033[0m"
			python3 new_evaluation.py "$student_id" "${Qi}" "testcase$counti"
		done
	fi

	echo ""

	#=- echo "------------>>>>> evaluation completed for the ${student_id} for the Q : ${Qi}"
}
function FLUSH_ALL()
{
	#
	# CLEARING ALL THE FILES, SO IT CAN REUSED FOR THE NEXT TESTCASE OR QUESTION
	#
	
	# > connectionstatus.log
	# > flags.log
	# > hex_content.log
	# 

	rm *.log 2>/dev/null
	rm out_* 2>/dev/null
	rm transfer.hex transfer.pcap 2>/dev/null 

}

function CLEAR_ALL()
{

        #=- echo "clearing all the programs and process!!!"

        END_TCPDUMP "transfer.log"

	for i in ${!coprocPids[@]};
	do
		# Closing the coproc FDs
		#=- echo "closing the fd ${coprocFDs[$i]}"
		eval "exec ${coprocFDs[$i]}>&-"
		#=- echo " status of closing coproc FD $?"

		# Killing the program 
		eval "kill -2 ${programPids[$i]}" 2>/dev/null
		#=- echo "status of killing the program $?"

		# killing the coproc itself
		eval "kill -2 ${coprocPids[$i]}"  2>/dev/null
		#=- echo "status of killing the coproc $?"
	done	

	#TIME_WAIT

	
	if [[ $? -eq 1 ]];then
		#echo -e "\033[36mSLEEPING FROM TIME WAIT\033[0m"
		sleep 1
	fi	

	bash port_reset_Advanced.sh
    bash reset_port_timeout.sh

}


function COMPILE()
{
	
	#=- echo "===>COMPILING THE PROGRAM $1"
	#=- echo "$FILE_PATH"
	
	if [[ $# -lt 2 ]];then
		echo -e "\033[36merror at line : $LINENO\033[0m"
		echo "ExPECTED : COMPILE <program_name> <out_file_name>"
		CLEAR_ALL
		exit 105
	fi

	gcc "${FILE_PATH}/$1" -o "$2"
	
	if [[ $? == 1 ]];then
		builtin echo -e "\033[31mCOMPILATION ERROR IN $1\033[0m"
		CLEAR_ALL
		exit 101	
	fi
	
	#=- echo "COMPILED $1 SUCCESSFULLY<==="
}


function RUN()
{

	#  $1  name of the file to run
	#   
	#  All the programs that are executed have a default coproc name
	#  which is assigned in the name format ~ coproc_i, where i is 
	#  the no of programs executed in the sequence. The output of each 
	#  program is stored in a file named in th format 
	

	#=- echo "--->running the program $1"
	
	if [[ $# == 0 ]];then
		echo "NO ARGUMENTS IS PROVIDED TO THE FUNCTION RUN() "
		echo "EXPECTED : RUN <program_name>"
		CLEAR_ALL
		exit 105

	elif [[ ! -e "$1" ]];then
		echo -e "\033[31m FILE : $1 DOES NOT EXITS\033[0m"
		CLEAR_ALL
		exit 103
	else
		echo "FILE EXIST AND FOUND"
	fi
	

	### Now running the file
	coproc "coproc_${PROGRAMS_RAN_COUNT}" { ./"$1" > out_${PROGRAMS_RAN_COUNT}; }
	
	### Assigning the coproc Pids to associative arrays

	temp="coproc_${PROGRAMS_RAN_COUNT}_PID"
	coprocPids["$1"]=${!temp}
	#=- echo "coprocPIDS ---)${coprocPids[@]}"
	#=- echo "names---)${!coprocPids[@]}"

	### Assigning the programs pids to the associative arrays
	tempchild=$(pgrep -P ${!temp})
	programPids["$1"]=$tempchild
	#=- echo "program PIDS ---)${programPids[@]}"

	### Assigning the coproc FDs to the associative array
        
	temp="coproc_${PROGRAMS_RAN_COUNT}[1]"        	
	coprocFDs["$1"]=${!temp}
	#=- echo "coprocFDS ---) ${coprocFDs[@]}"
	
	temp="coproc_${PROGRAMS_RAN_COUNT}[0]"
        coprocReadFDs["$1"]=${!temp}
        #=- echo "coprocREADFDS ---) ${coprocReadFDs[@]}"

	#=- echo "started executing the program<---"

	((PROGRAMS_RAN_COUNT++))
	#=- echo "-->>>>$PROGRAMS_RAN_COUNT"
}

function INPUT()
{
	#=- echo "INPUT $1 with $2 from $3 to $4"
		
	if [[ ! -e $2 ]];then
		echo "FILE NOT EXIT"
		return 0
	
	else
		echo ""
		#echo "FILE $2 EXISTS"
	fi

	allocatedFDs=$(ls /proc/$$/fd/)

	#=- echo "THAT FD : ${allocatedFDs[2]}"
	declare -i i=0
	declare -i count=0
	ftemp=$3
	start_line=$((ftemp - 1))
	while IFS=  read -r line;
	do
		#=- echo "$line"
		if [[ $i -lt $start_line ]];then
			((i++))
			#=- echo "skip $i"
			continue
		fi

		if [[ ! $count -lt $4 ]];then
			break	
		fi

		((count++))
		#=- echo " feeding <<<$line>>> to $1"

		_fd_="${coprocFDs[$1]}"
		#=- echo "passning input to that fd : $_fd_"		
		eval 'builtin echo "${line}" >&$_fd_'
		#sleep 1

	done < $2

#	sleep 1
}


function ASSIGN_PORT()
{
	#=- echo "--->mark port to the porgram"
		
	#ASSIGnport myserver ${serverPort[0]} | 1025
	
	# 	$1	name of the application
	#	$2	application type
	#	$3	port numbers

	#=- echo ">>>>>>>>>marking port:$3 to the program:$2 of type: $1"

	Assigned_Ports["$3"]="$1"


	#ASSignport myclient ${clientPOrt[0]} | 5001

	#=- echo "marked port successfully<---"
}
function get_ports()
{
#=- echo "-----------------------------------"

	for k in ${SERVER[@]};
        do
		#=- echo "s : $k"
                for key in "${Assigned_Ports[@]}";
		do
			#=- echo "ap : $key"
			if [[ "$k" == "${Assigned_Ports[$key]}" ]];then
				#=- echo ""
				echo -n "$key," >> hi
			fi
		done
        done 

	echo "" >> hi
	
	for k in ${CLIENT[@]};
        do
                for key in "${Assigned_Ports[@]}";
                do
                        if [[ "$k" == "${Assigned_Ports[$key]}" ]];then
                                echo -n "$key," >> hi
				break
                        fi
                done
        done

        echo "" >> hi

	for k in ${PROXY[@]};
        do
                for key in "${Assigned_Ports[@]}";
                do
                        if [[ "$k" == "${Assigned_Ports[$key]}" ]];then
                                echo -n "$key," >> hi
                        fi
                done
        done

        echo "" >> hi
}

function CHECK_PORT()
{
	### Flusing the connectionstatus.log initially
	
	> connectionstatus.log


	if [[ $# -lt 5 ]];then
		#=- echo "NOT GIVEN ARGUMENTS CORRECTLY"									
		#=- echo "EXPECTED : CHECK_PORT <FROM_ip:port> <TO_ip:port> <program_name> <protocol> <connection_status> <yes_or_no>"
		return 0
	fi
	
	declare -A status
        declare -A reverse_status
	status["LISTEN"]="0A"
	status["ESTABLISHED"]="01"	
	status["CLOSE_WAIT"]="08"
	status["TIME_WAIT"]="06"
	status["FIN_WAIT2"]="05"
	status["SYN_SENT"]="02"
	status["FIN_WAAIT1"]="04"

	reverse_status["0A"]="LISTEN"
	reverse_status["01"]="ESTABLISHED"
	reverse_status["02"]="SYS_SENT"
	reverse_status["04"]="FIN_WAIT1"
	reverse_status["05"]="FIN_WAIT2"
	reverse_status["06"]="TIME_WAIT"
	reverse_status["08"]="CLOSE_WAIT"

	#=- echo "===> CHECKING THE ESTABLISH OF THE PORT"
	
	#=- echo "checking ip:port  from $1  to $2 for $3"
	
	FROM_port_hex_LITTLE=$(iptohex "$1")
        #=- echo "FROM : $FROM_port_hex_LITTLE"

	TO_port_hex_LITTLE=$(iptohex "$2")
	#=- echo "TO : $TO_port_hex_LITTLE"

if [[ "$5" == "LISTEN" ]];then
	hex_content=$(cat /proc/${programPids[$3]}/net/$4 | grep "$FROM_port_hex_LITTLE $TO_port_hex_LITTLE")
else 
	hex_content=$(cat /proc/${programPids[$3]}/net/$4 | grep -e "$FROM_port_hex_LITTLE $TO_port_hex_LITTLE" -e "$TO_port_hex_LITTLE $FROM_port_hex_LITTLE")
fi
	#=- echo "full content ||||$(cat /proc/${programPids[$3]}/net/$4)||||"
	#=- echo "the hex_content -> $hex_content"

	if [[ "$hex_content" == "" ]];then
		builtin echo "NO CONNECTEION FOUND  between {$1} and {$2}"
		builtin echo "$1 $2 NO" >> connectionstatus.log
		#=- echo "VERIFIED <==="

		if [[ $# -eq 5 ]];then
			python3 conn.py "${student_id}" "$5"  
		elif [[ $# -eq 6 ]];then
			python3 conn.py "${student_id}" "NO"
		
		fi

		return
		
	fi

while IFS= read -r hex_line;
do
	IFS=' ' read -a expectedC <<< "$hex_line"

	local_address=${expectedC[1]}
	remote_address=${expectedC[2]}
	conn_status=${expectedC[3]}

	#=- echo "$local_address > $remote_address with connection status:$conn_status"
	
	if [[ "${status[$5]}" == "$conn_status" ]];then
		builtin echo "$1 $2 $5" >> connectionstatus.log
		builtin echo -e "$local_address is has a { $5 } connection to $remote_address"
		break  #<<<<<<<<<<<<<<  this is only A TEMPRORY SOLUTION
	else 
		builtin	echo "$1 $2 NO" >> connectionstatus.log
                #=- echo "$local_address is has a { "${reverse_status[$conn_status]}" } connection to $remote_address [ NOT EXPECTED ]"
		break
	fi

done <<< "$hex_content"
	
### CHECKING THE STATUS OF THE CONNECTOIN

	if [[ $# -eq 5 ]];then
		python3 conn.py "${student_id}" "$5"  
	elif [[ $# -eq 6 ]];then
		python3 conn.py "${student_id}" "NO"
	
	fi

	#=- echo "VERIFIED SUCCESSFULLY<==="

}


function COMPILE_RUN()
{
	# 	$1 	name of the file to compile and run

	#=- echo "===>COMPILING THE PROGRAM $1"
        #=- echo "$FILE_PATH"

        if [[ $# -lt 2 ]];then
                echo -e "\033[36merror at line : $LINENO\033[0m"
		echo "ExPECTED : COMPILE <program_name> <out_file_name> <optional \${CLIENT_PORT[i]} or \${PROXY_PORT[i]}>"
                CLEAR_ALL
                exit 105
        fi

        if [[ "$1" == *.c ]];then

        	gcc "$1" -o "$2"
        	
		elif [[ "$1" == *.java ]];then

			javac "$1"
		
		fi
		
        if [[ $? == 1 ]];then
                echo -e "\033[31mCOMPILATION ERROR IN $1 \033[0m"
                CLEAR_ALL
                exit 101
        fi

        echo -e "\033[47m\033[30mCOMPILED $1 SUCCESSFULLY\033[0m"

### setting  the port

	#=- echo "settings the port $3 for the program $1"
#  we do not need this as the ports are being set by the students in their
#  code. This is a heavy to the students but okay.
# 
# 	if [[ $# == 4 ]];then
# 		bash port_set_Advanced.sh $3 $4
# 	elif [[ $# == 3 ]];then
# 		 bash port_set_Advanced.sh $3 $3
# 	fi


### Now running the program

	
	### Now running the file

		if [[ "$1" == *.c ]];then

			echo "RUNNING JAVA FILE [ ${1} ]"
	        coproc "coproc_${PROGRAMS_RAN_COUNT}" { ./$2 > out_${PROGRAMS_RAN_COUNT}; }
			
		elif [[ "$1" == *.java ]];then

			file_name_java="${1%.java}"

			echo "RUNNING JAVA FILE [ ${file_name_java} ]"
	        coproc "coproc_${PROGRAMS_RAN_COUNT}" { java "${file_name_java}" > out_${PROGRAMS_RAN_COUNT}; }
		
		fi

		#echo "[ EXIT CODE OF COPROC_${PROGRAMS_RAN_COUNT} : $? ]"


        ### Assigning the coproc Pids to associative arrays

        temp="coproc_${PROGRAMS_RAN_COUNT}_PID"
        coprocPids["$2"]=${!temp}
        #=- echo "coprocPIDS ---)${coprocPids[@]}"
        #=- echo "names---)${!coprocPids[@]}"

        ### Assigning the programs pids to the associative arrays
		tempchild=$(pgrep -P "${!temp}")
		#=- echo "sub process of : ${!temp} is : $tempchild"

        programPids["$2"]=$tempchild
        #=- echo "program PIDS ---)${programPids[@]}"

        ### Assigning the coproc FDs to the associative array

        temp="coproc_${PROGRAMS_RAN_COUNT}[1]"
        coprocFDs["$2"]=${!temp}
        #=- echo "coprocFDS ---) ${coprocFDs[@]}"


	    temp="coproc_${PROGRAMS_RAN_COUNT}[0]"
        coprocReadFDs["$2"]=${!temp}
        #=- echo "coprocFDS ---) ${coprocReadFDs[@]}"

        #=- echo "started executing the program<---"

        ((PROGRAMS_RAN_COUNT++))

#		ls -l /proc/$$/fd/
        #echo -e "--->>>( $PROGRAMS_RAN_COUNT )\n"

}

function WAIT_PORT()
{
	#=- echo "checking from wait_port with prto:$1 for port:$2"
	s=$(PORT_AVAIL "$1" $2)
	#=- echo "|	status PORT_AVAIL:{ $s }	|" 
	if [[ "$s" == "01" || "$s" == "0A" ]];then
		
		print ">>> \033[36mTHE PORT:$2 IS ALREADY IN USE\033[0m <<<"
		CLEAR_ALL
		exit 301
	elif [[ "$s" == "05" || "$s" == "06" ]];then
		
		hexP=$(printf "%04X" "$2")
       		sC=$(cat /proc/net/"$1" | grep ":$hexP ")
		
		ccount=0
		final_time=0
		while IFS= read -r single_line;
		do	
			echo "	PORT STATUS(${ccount}) : { $single_line }"
			the_timer=$(builtin echo -e "$single_line" | awk '{print $6}')
			IFS=':' read -a type_when <<< "$the_timer"
			
			time_till_com_hex=${type_when[1]}
			echo "TIME NEED TO WAIT FOR THE PORT TO FREE FROM BIND(${ccount}) : $time_till_com_hex"
			formated_hex=$(builtin echo -n "0x${time_till_com_hex}")

			time_decimal=$(printf "%d" "$formated_hex")
			echo "THE TIME NEED TO WAIT(IN DECIMAL): $time_decimal"

			HZ_OF_CPU=$(getconf CLK_TCK)
			net_time=$(((time_decimal/HZ_OF_CPU)+5))

			if [[ $net_time -gt $final_time ]];then
				final_time=$net_time
			fi

			((ccount++))
			
		done <<< "$sC"

		echo -e "\033[33mSLEEPING FOR ${final_time} SECONDS\033[0m"
		sleep $final_time 

		cat /proc/net/tcp
		snew=$(PORT_AVAIL "$1" $2)

		#=- echo "THE NEW STATUS : { $snew }"
		if [[ "$snew" != "05" && "$snew" != "06" ]];then
			echo "PORT FREED!!!"
			#bash reduce_port_timeout.sh		
		else
			
			#=- echo -e \033[31m"PORT NOT FREED\033[0m : { $snew }"
		#	sleep 2
			snew=$(PORT_AVAIL "$1" $2)
			#=- echo "latest : { $snew }"
			CLEAR_ALL
			exit 301
		fi
	else
		echo "GOT DIFFERENT STATUS >>> { $s } <<<"
		#CLEAR_ALL
        #exit 301
	fi
	
	bash reduce_port_timeout.sh

}
function ISALIVE()
{
	#
	# $1 name of the program
	#

	kill -0 ${programPids["$1"]} 2>/dev/null
	
	kill_status=$?
	#=- echo "kill_status : $kill_status"
	if [[ $kill_status == 0 ]];then
		#=- echo -e "PROGRAM : $1 IS \033[36mALIVE\033[0m"
		return 1
	else
		#=- echo -e "PROGRAM : $1 IS \033[36mDEAD\033[0m"
		return 0
	fi
}
function SAFE_KILL()
{

	if [[ "$#" != "1" ]];then
		#=- echo -e "\033[36mnot enough arguments SAFE_KILL <program_name> $1\033[0m"
		return 0
	fi

	#=- echo "------- KILLING $1 --------" 

	# $1 name of the program to kill safely


		# Closing the coproc FDs
        #=- echo "closing the fd ${coprocFDs[$1]}"

        eval "exec ${coprocFDs[$1]}>&-"
	#=- echo "STATUS : $?"

	eval "exec ${coprocReadFDs[$1]}>&-"
	#=- echo "STATUS : $?"
	#=- echo " status of closing coproc FD $?"

                # Killing the program
        kill -2  "${programPids[$1]}"
        #=- echo "status of killing the program : $?"
	wait ${programPids[$1]}
        #=- echo "WAIT : $?"

	       # killing the coproc itself
        kill -TERM "-${coprocPids[$1]}"
        #=- echo "status of killing the coproc : $?"
	wait ${coprocPids[$1]}
	#=- echo "WAIT : $?"

	#=- echo "SUB PROCESS : $$"


	#=- echo "----------KILLED $1 SUCCESSFULLY---------"
	
#	ls /proc/$$/fd/
}


function START_CHECK_PERSISTENT()
{

	# This function is not a major need it is just to
	# flush the flags.log and make initial setup for
	# the PERSISTENT.py to evaluate successfully.

	#=- echo "=== START OF CHECK PERSISTANT ==="
	>flags.log

}

function END_CHECK_PERSISTENT()
{

	#
	# $1 Maximum allowed Re-connections
	# $2 Expected type of connection (persistent or non-persistent)
	#

	python3 persistent.py "$student_id" $1 $2

	#=- echo "=== END OF CHECK PERSISTANT ==="
}
