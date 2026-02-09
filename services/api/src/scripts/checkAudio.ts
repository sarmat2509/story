#!/usr/bin/env tsx
/**
 * Check audio file size and duration
 * Usage: npx tsx src/scripts/checkAudio.ts <relativeFilePath>
 */

import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';

const relativeFilePath = process.argv[2];

if (!relativeFilePath) {
  console.error('❌ Usage: npx tsx src/scripts/checkAudio.ts <relativeFilePath>');
  console.error('Example: npx tsx src/scripts/checkAudio.ts development/user-id/story-id/audio/file.mp3');
  process.exit(1);
}

// Get absolute path from project root
const projectRoot = path.resolve(__dirname, '../..');
const storageRoot = path.join(projectRoot, 'uploads');
const fullPath = path.join(storageRoot, relativeFilePath);

console.log('📁 File Check');
console.log('='.repeat(60));
console.log('Relative path:', relativeFilePath);
console.log('Full path:', fullPath);
console.log('');

// Check if file exists
if (!fs.existsSync(fullPath)) {
  console.error('❌ File not found:', fullPath);
  process.exit(1);
}

// Get file size
const stats = fs.statSync(fullPath);
const sizeBytes = stats.size;
const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

console.log('✅ File exists');
console.log('📊 Size:', sizeBytes.toLocaleString(), 'bytes', `(${sizeMB} MB)`);
console.log('');

// Set ffprobe path
const ffprobePath = path.join(projectRoot, 'bin/ffprobe');
if (fs.existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath);
  console.log('🔧 Using local ffprobe:', ffprobePath);
} else {
  console.log('⚠️  Local ffprobe not found, using system ffprobe');
}

// Get audio metadata using ffprobe
console.log('');
console.log('🔍 Analyzing audio with ffprobe...');
console.log('');

ffmpeg.ffprobe(fullPath, (err, metadata) => {
  if (err) {
    console.error('❌ ffprobe error:', err.message);
    process.exit(1);
  }

  const format = metadata.format;
  const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

  console.log('📼 Audio Metadata:');
  console.log('-'.repeat(60));
  console.log('Format:', format.format_long_name);
  console.log('Duration:', format.duration, 'seconds', `(${Math.floor(Number(format.duration) / 60)}m ${Math.floor(Number(format.duration) % 60)}s)`);
  console.log('Bitrate:', format.bit_rate ? `${(Number(format.bit_rate) / 1000).toFixed(0)} kbps` : 'N/A');
  console.log('');
  
  if (audioStream) {
    console.log('🎵 Audio Stream:');
    console.log('-'.repeat(60));
    console.log('Codec:', audioStream.codec_long_name);
    console.log('Sample rate:', audioStream.sample_rate, 'Hz');
    console.log('Channels:', audioStream.channels);
    console.log('Channel layout:', audioStream.channel_layout);
    console.log('Bit rate:', audioStream.bit_rate ? `${(Number(audioStream.bit_rate) / 1000).toFixed(0)} kbps` : 'N/A');
  }
  
  console.log('');
  console.log('✅ Analysis complete!');
});
