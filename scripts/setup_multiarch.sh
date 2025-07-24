#!/bin/bash

# Detect OS type
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS type"
    exit 1
fi

# Install required packages
case $OS in
    "ubuntu"|"debian")
        echo "Detected Ubuntu/Debian - Installing requirements"
        sudo apt update
        sudo apt install -y qemu-user-static binfmt-support docker-buildx-plugin
        ;;
    "amzn"|"rhel"|"centos")
        echo "Detected Amazon Linux/RHEL/CentOS - Installing requirements"
        sudo yum update -y
        sudo yum install -y qemu-user-static docker-buildx-plugin
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

echo "Setting up QEMU emulation for ARM64 docker build"

# Setup QEMU with persistent configuration

if [ "$OS" == "amzn" ]; then
    echo "Amazon Linux detected - checking binfmt_misc configuration"
    sudo mount binfmt_misc -t binfmt_misc /proc/sys/fs/binfmt_misc
    docker run --privileged --rm tonistiigi/binfmt --install arm64
else
    docker run --privileged --rm tonistiigi/binfmt --install arm64
    echo "Creating multi-architecture builder..."
    docker buildx rm multiarch 2>/dev/null || true
    docker buildx create --name multiarch --driver docker-container --use
    docker buildx inspect --bootstrap
fi

echo "Checking supported architectures..."
docker buildx ls

echo "Multi-architecture build environment setup complete!"