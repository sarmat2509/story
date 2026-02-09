# FFmpeg Binary

This directory contains the FFmpeg binary required for audio concatenation.

## Automatic Installation (Recommended)

FFmpeg is automatically installed when you run `pnpm install` in the `services/api` directory:

```bash
cd services/api
pnpm install
```

Or manually run the installation script:

```bash
cd services/api
pnpm run install:ffmpeg
```

The installation script automatically detects your platform (macOS, Linux) and architecture (x86_64, ARM64) and downloads the appropriate FFmpeg binary.

## Manual Installation

If the automatic installation fails, you can download FFmpeg manually:

### macOS (Apple Silicon / Intel)

```bash
cd services/api/bin
curl -L -o ffmpeg.zip https://evermeet.cx/ffmpeg/getrelease/zip
unzip ffmpeg.zip
chmod +x ffmpeg
rm ffmpeg.zip
```

### Linux (x86_64)

```bash
cd services/api/bin
curl -L -o ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar xf ffmpeg.tar.xz --strip-components=1 --wildcards '*/ffmpeg'
chmod +x ffmpeg
rm ffmpeg.tar.xz
```

### Linux (ARM64)

```bash
cd services/api/bin
curl -L -o ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz
tar xf ffmpeg.tar.xz --strip-components=1 --wildcards '*/ffmpeg'
chmod +x ffmpeg
rm ffmpeg.tar.xz
```

### Windows

Download from [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/) and extract `ffmpeg.exe` to this directory.

## Verify Installation

```bash
./ffmpeg -version
```

You should see FFmpeg version information.

## Docker Deployment

For Docker deployments, the installation script runs automatically during `pnpm install`.

Alternatively, use system FFmpeg:

```dockerfile
# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

## Why Bundled?

Bundling FFmpeg ensures:
- ✅ Consistent version across environments
- ✅ No system dependencies
- ✅ Works in restricted environments
- ✅ Easier deployment
- ✅ Automatic installation with `pnpm install`

## Troubleshooting

If FFmpeg installation fails:

1. Check your internet connection
2. Ensure you have `curl` or `wget` installed
3. Run the installation script manually: `pnpm run install:ffmpeg`
4. Check the error message for platform-specific issues
5. Install manually following the instructions above

For support, check the installation script at `services/api/scripts/install-ffmpeg.sh`

