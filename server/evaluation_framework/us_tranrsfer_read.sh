#!/bin/bash

	Qi=$1		# QUESTION NUMBER
	Ti=$2		# TESTCASE NUMBER
	PROTOCOL=$3	# PROTOCOL tcp, udp
	
        > meta_${Qi}_T_${Ti}.log
        > ack_${Qi}_T_${Ti}.log
        > data_${Qi}_T_${Ti}.log
        > dhead_${Qi}_T_${Ti}.log
	> unitsep.log
	> flags.log

        echo "protocol $PROTOCOL"

        length=0
        previous_line=""
        previous_meta=""

	us=$'\x1F'

        REGEX_tcp='IP.*Flags.*win.*length\ [0-9]+'
        REGEX_udp='IP.* > .*UDP, length\ [0-9]+'

        protocol_regex="REGEX_$PROTOCOL"

        echo "regex name $protocol_regex"
        echo "regex->${!protocol_regex}"

        while IFS= read -r line;
        do
                if [[ $line =~ ${!protocol_regex} ]];then
                        echo $line >> meta_${Qi}_T_${Ti}.log

			
			if [[ "$PROTOCOL" == "tcp" ]];then
			
				### this operation need to be performed only during the 
				### TCP protocol.
				echo "$line" | awk '{print $3,$5,$7}' >> flags.log
			fi

			
			echo "|||${line}|||"
                        if [[ $length == "0" ]];then
                        #       echo "got length 0"
                                length=$(echo $line | awk '{print $NF}')
                                previous_meta=$line
				if [[  $previous_line == "" ]];then
                                        continue
                                fi

				#echo "current line |||$previous_line|||"
                                echo "$previous_line" >> ack_${Qi}_T_${Ti}.log
		 		previous_line=""
		 		continue
                        fi

                        size=${#previous_line}
                        data=${previous_line:$((size-length-1)):$length}
                        #echo "the data->$data"


                        echo -n "$data" >> data_${Qi}_T_${Ti}.log

                        echo "$previous_meta" >> dhead_${Qi}_T_${Ti}.log
			
#		us=$'\x1F'	
		netData=$(echo "$previous_meta" | awk '{print $3}')
		netData+=$us
		netData+=$(echo "$previous_meta" | awk '{print $5}')
		netData+=$us
		netData+="$data"
		netData+=$us

		echo -n "$netData" >> unitsep.log

		### RESETTING FOR THE NEXT LOOP
                        length=$(echo $line | awk '{print $NF}')
                        #echo "the length:$length"

                        previous_line=""              
			previous_meta=$line
			continue
                fi

                previous_line+=$line
                previous_line+=$'\n'

		#echo "current line |||$previous_line|||"
        done < transfer.log


	if [[ $length == 0 ]];then
		echo "$previous_line" >> ack_${Qi}_T_${Ti}.log
	else
		size=${#previous_line}
                data=${previous_line:$((size-length-2)):$length}

#		us=$'\x1F'
                netData=$(echo "$previous_meta" | awk '{print $3}')
                netData+=$us
                netData+=$(echo "$previous_meta" | awk '{print $5}')
                netData+=$us
                netData+="$data"
                netData+=$us


                echo -n "$netData" >> unitsep.log

                echo "$data" >> data_${Qi}_T_${i}.log
                echo "$previous_meta" >> dhead_${Qi}_T_${i}.log
	fi

	

