# Use Ubuntu 22.04 base image
FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm-256color
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Install essential tools only
RUN apt-get update && apt-get install -y \
    openssh-server \
    gcc g++ make \
    python3 python3-pip \
    iputils-ping \
    net-tools \
    tcpdump \
    traceroute \
    iproute2 \
    vim nano curl bash psmisc lsof procps \
    libcap2-bin \
    sudo && \
    apt-get clean

# Create labuser (least privileges, no sudo)
RUN useradd -m -s /bin/bash labuser && \
    mkdir -p /home/labuser/.ssh && \
    chmod 700 /home/labuser/.ssh

COPY labuser_key.pub /home/labuser/.ssh/authorized_keys

RUN chown -R labuser:labuser /home/labuser/.ssh && \
    chmod 600 /home/labuser/.ssh/authorized_keys

# Create networklab user (allowed tcpdump + sysctl only)
RUN useradd -m -s /bin/bash networklab && \
    mkdir -p /home/networklab/.ssh && \
    chmod 700 /home/networklab/.ssh

COPY networklab_key.pub /home/networklab/.ssh/authorized_keys

RUN chown -R networklab:networklab /home/networklab/.ssh && \
    chmod 600 /home/networklab/.ssh/authorized_keys

# Set SSH restrictions
RUN mkdir /var/run/sshd && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    sed -i 's/#PermitEmptyPasswords no/PermitEmptyPasswords no/' /etc/ssh/sshd_config && \
    sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config && \
    echo "AllowUsers labuser networklab" >> /etc/ssh/sshd_config && \
    echo "AuthorizedKeysFile %h/.ssh/authorized_keys" >> /etc/ssh/sshd_config && \
    echo "UsePAM yes" >> /etc/ssh/sshd_config && \
    echo "AcceptEnv LANG LC_*" >> /etc/ssh/sshd_config && \
    echo "TCPKeepAlive yes" >> /etc/ssh/sshd_config && \
    echo "PermitTTY yes" >> /etc/ssh/sshd_config

# Generate host SSH keys
RUN ssh-keygen -A

# Capabilities for tcpdump (network access) and lsof (filesystem read)
RUN setcap cap_net_raw,cap_net_admin=eip /usr/bin/tcpdump && \
    setcap cap_dac_read_search=eip /usr/bin/lsof || true

# Restrict both users via aliasing and readonly .bashrc
RUN for user in labuser networklab; do \
    echo "export TERM=xterm-256color" >> /home/$user/.bashrc && \
    echo "export LANG=C.UTF-8" >> /home/$user/.bashrc && \
    echo "export LC_ALL=C.UTF-8" >> /home/$user/.bashrc && \
    echo "alias sudo='echo Permission denied'" >> /home/$user/.bashrc && \
    echo "alias su='echo Permission denied'" >> /home/$user/.bashrc && \
    echo "alias chmod='echo Permission denied'" >> /home/$user/.bashrc && \
    echo "alias chown='echo Permission denied'" >> /home/$user/.bashrc && \
    echo "alias who='echo Permission denied'" >> /home/$user/.bashrc && \
    echo "alias which='echo Permission denied'" >> /home/$user/.bashrc && \
    echo "alias users='echo Permission denied'" >> /home/$user/.bashrc && \
    echo "alias top='echo Permission denied'" >> /home/$user/.bashrc && \
    chown root:root /home/$user/.bashrc && \
    chmod 444 /home/$user/.bashrc; \
    done

# Only allow tcpdump and sysctl via sudo for networklab (but no sudo access to anything else)
RUN echo "networklab ALL=(ALL) NOPASSWD: /usr/bin/tcpdump, /sbin/sysctl, /usr/sbin/sysctl, /bin/sysctl, /usr/bin/sysctl" > /etc/sudoers.d/networklab_limited && \
    chmod 440 /etc/sudoers.d/networklab_limited

# Allow sudo sysctl to write to read only files 
RUN echo "alias sysctl='/usr/bin/sudo sysctl'" >> /home/networklab/.bashrc

# Fixed CN evaluation framework (generic scripts — not per-question)
COPY evaluation_framework/ /home/networklab/evaluation/
RUN chmod +x /home/networklab/evaluation/*.sh && \
    chown -R networklab:networklab /home/networklab/evaluation

# Working directory for SSH login
WORKDIR /home/labuser

# Switch to root for launching sshd
USER root

# Expose SSH
EXPOSE 22

# Start SSH
CMD ["/usr/sbin/sshd", "-D"]