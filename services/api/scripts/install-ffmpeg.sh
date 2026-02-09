#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🎬 FFmpeg Installation Script${NC}"
echo "================================"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BIN_DIR="$SCRIPT_DIR/../bin"

# Create bin directory if it doesn't exist
mkdir -p "$BIN_DIR"

# Check if ffmpeg already exists
if [ -f "$BIN_DIR/ffmpeg" ] && [ -f "$BIN_DIR/ffprobe" ]; then
    echo -e "${YELLOW}⚠️  FFmpeg and ffprobe already exist${NC}"
    
    # Verify they work
    if "$BIN_DIR/ffmpeg" -version > /dev/null 2>&1 && "$BIN_DIR/ffprobe" -version > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Existing FFmpeg and ffprobe are working correctly${NC}"
        echo ""
        "$BIN_DIR/ffmpeg" -version | head -3
        echo ""
        "$BIN_DIR/ffprobe" -version | head -1
        exit 0
    else
        echo -e "${YELLOW}⚠️  Existing FFmpeg/ffprobe don't work, reinstalling...${NC}"
        rm -f "$BIN_DIR/ffmpeg" "$BIN_DIR/ffprobe"
    fi
fi

# Detect platform and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "Detected platform: $OS $ARCH"
echo ""

cd "$BIN_DIR"

case "$OS" in
    Darwin*)
        # macOS
        echo -e "${GREEN}📦 Downloading FFmpeg for macOS...${NC}"
        
        if ! command -v curl &> /dev/null; then
            echo -e "${RED}❌ curl is required but not installed${NC}"
            exit 1
        fi
        
        # Download from evermeet.cx (supports both Intel and Apple Silicon)
        echo "Downloading FFmpeg..."
        curl -L -o ffmpeg.zip https://evermeet.cx/ffmpeg/getrelease/zip
        
        echo "Downloading ffprobe..."
        curl -L -o ffprobe.zip https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip
        
        echo "Extracting..."
        unzip -q -o ffmpeg.zip
        unzip -q -o ffprobe.zip
        rm ffmpeg.zip ffprobe.zip
        
        chmod +x ffmpeg ffprobe
        echo -e "${GREEN}✅ FFmpeg and ffprobe installed successfully${NC}"
        ;;
        
    Linux*)
        # Linux
        echo -e "${GREEN}📦 Downloading FFmpeg for Linux...${NC}"
        
        if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
            echo -e "${RED}❌ curl or wget is required but not installed${NC}"
            exit 1
        fi
        
        case "$ARCH" in
            x86_64|amd64)
                echo "Downloading static build for x86_64..."
                URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
                ;;
            aarch64|arm64)
                echo "Downloading static build for ARM64..."
                URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
                ;;
            *)
                echo -e "${RED}❌ Unsupported Linux architecture: $ARCH${NC}"
                echo "Please install FFmpeg manually"
                exit 1
                ;;
        esac
        
        if command -v curl &> /dev/null; then
            curl -L -o ffmpeg.tar.xz "$URL"
        else
            wget -O ffmpeg.tar.xz "$URL"
        fi
        
        echo "Extracting..."
        tar xf ffmpeg.tar.xz --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe'
        rm ffmpeg.tar.xz
        
        chmod +x ffmpeg ffprobe
        echo -e "${GREEN}✅ FFmpeg and ffprobe installed successfully${NC}"
        ;;
        
    MINGW*|MSYS*|CYGWIN*)
        # Windows
        echo -e "${RED}❌ Windows is not supported by this script${NC}"
        echo ""
        echo "Please install FFmpeg and ffprobe manually:"
        echo "1. Download from https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        echo "2. Extract ffmpeg.exe and ffprobe.exe to $BIN_DIR/"
        exit 1
        ;;
        
    *)
        echo -e "${RED}❌ Unsupported operating system: $OS${NC}"
        echo "Please install FFmpeg manually"
        exit 1
        ;;
esac

# Verify installation
echo ""
echo -e "${GREEN}🔍 Verifying FFmpeg installation...${NC}"
if [ -f "$BIN_DIR/ffmpeg" ] && "$BIN_DIR/ffmpeg" -version > /dev/null 2>&1; then
    echo -e "${GREEN}✅ FFmpeg is working correctly!${NC}"
    "$BIN_DIR/ffmpeg" -version | head -1
else
    echo -e "${RED}❌ FFmpeg installation failed${NC}"
    exit 1
fi

if [ -f "$BIN_DIR/ffprobe" ] && "$BIN_DIR/ffprobe" -version > /dev/null 2>&1; then
    echo -e "${GREEN}✅ ffprobe is working correctly!${NC}"
    "$BIN_DIR/ffprobe" -version | head -1
else
    echo -e "${RED}❌ ffprobe installation failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo "FFmpeg location: $BIN_DIR/ffmpeg"
echo "ffprobe location: $BIN_DIR/ffprobe"
