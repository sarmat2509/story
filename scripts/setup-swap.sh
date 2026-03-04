#!/bin/bash

# Add 2GB swap on droplet to allow Docker builds on 1GB RAM
# Run ON THE DROPLET: curl -sSL <url> | bash   OR   scp + ssh
# Usage on droplet: sudo ./scripts/setup-swap.sh

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0"
  exit 1
fi

SWAPFILE="/swapfile"
SWAP_SIZE="2G"

if [ -f "$SWAPFILE" ]; then
  echo "Swap already exists at $SWAPFILE"
  swapon --show
  exit 0
fi

echo "Creating ${SWAP_SIZE} swap file..."
fallocate -l $SWAP_SIZE $SWAPFILE
chmod 600 $SWAPFILE
mkswap $SWAPFILE
swapon $SWAPFILE

if ! grep -q "$SWAPFILE" /etc/fstab; then
  echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab
  echo "Added to /etc/fstab for persistence"
fi

echo ""
echo "✅ Swap enabled:"
swapon --show
free -h
