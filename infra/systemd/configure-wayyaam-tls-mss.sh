#!/usr/bin/env bash
set -euo pipefail

if ! /usr/sbin/iptables -t mangle -C FORWARD -o eth0 -p tcp --sport 443 --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1200 2>/dev/null; then
  /usr/sbin/iptables -t mangle -I FORWARD 1 -o eth0 -p tcp --sport 443 --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1200
fi

/usr/sbin/iptables -t mangle -C FORWARD -o eth0 -p tcp --sport 443 --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1200
