/**
 * Audio Concatenator using FFmpeg
 * 
 * Concatenates multiple MP3 audio buffers into a single seamless MP3 file.
 * Uses fluent-ffmpeg for reliable audio processing with proper codec handling.
 * 
 * FFmpeg binary is bundled with the application in services/api/bin/ffmpeg
 * to avoid system dependency issues.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../../utils/logger';

// Set path to bundled FFmpeg binary
const ffmpegPath = path.join(__dirname, '../../../bin/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

logger.info({ ffmpegPath }, 'FFmpeg path configured');

/**
 * Probe audio file duration using ffprobe
 * @param filePath - Path to audio file
 * @returns Duration in seconds
 */
async function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.warn({ err, filePath }, 'Failed to probe audio duration, using 0');
        resolve(0);
      } else {
        const duration = metadata.format.duration || 0;
        resolve(duration);
      }
    });
  });
}

/**
 * Concatenate multiple audio buffers into one MP3
 * 
 * Uses FFmpeg's concat demuxer for seamless concatenation without re-encoding.
 * Temporary files are automatically cleaned up after processing.
 * 
 * @param audioBuffers - Array of audio buffers (MP3 format)
 * @returns Object with concatenated MP3 buffer and actual duration in seconds
 * @throws Error if FFmpeg processing fails
 * 
 * @example
 * const buffers = [buffer1, buffer2, buffer3];
 * const { buffer: finalAudio, durationSeconds } = await concatenateAudioBuffers(buffers);
 */
export async function concatenateAudioBuffers(
  audioBuffers: Buffer[]
): Promise<{ buffer: Buffer; durationSeconds: number }> {
  if (audioBuffers.length === 0) {
    throw new Error('No audio buffers provided for concatenation');
  }

  if (audioBuffers.length === 1) {
    // For single buffer, still probe duration
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-probe-'));
    const tempFile = path.join(tempDir, 'single.mp3');
    
    try {
      await fs.writeFile(tempFile, audioBuffers[0]);
      const duration = await probeAudioDuration(tempFile);
      return { buffer: audioBuffers[0], durationSeconds: duration };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-concat-'));
  const tempFiles: string[] = [];
  const listFilePath = path.join(tempDir, 'concat-list.txt');
  const outputFilePath = path.join(tempDir, 'output.mp3');

  try {
    logger.info(
      { numChunks: audioBuffers.length, tempDir },
      'Starting audio concatenation'
    );

    // Write each buffer to a temporary file
    for (let i = 0; i < audioBuffers.length; i++) {
      const tempFile = path.join(tempDir, `chunk_${i}.mp3`);
      await fs.writeFile(tempFile, audioBuffers[i]);
      tempFiles.push(tempFile);
    }

    // Create FFmpeg concat list file
    // Format: file 'chunk_0.mp3'\nfile 'chunk_1.mp3'\n...
    const listContent = tempFiles
      .map((file) => `file '${path.basename(file)}'`)
      .join('\n');
    await fs.writeFile(listFilePath, listContent, 'utf-8');

    logger.debug(
      { listContent, tempFiles: tempFiles.length },
      'Created FFmpeg concat list'
    );

    // Run FFmpeg to concatenate
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFilePath)
        .inputOptions([
          '-f concat', // Use concat demuxer
          '-safe 0', // Allow absolute paths
        ])
        .outputOptions([
          '-c copy', // Copy codec (no re-encoding for speed)
        ])
        .output(outputFilePath)
        .on('start', (commandLine) => {
          logger.debug({ commandLine }, 'FFmpeg concatenation started');
        })
        .on('end', () => {
          logger.info('FFmpeg concatenation completed successfully');
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          logger.error(
            {
              error: err.message,
              stdout,
              stderr,
            },
            'FFmpeg concatenation failed'
          );
          reject(
            new Error(`FFmpeg concatenation failed: ${err.message}`)
          );
        })
        .run();
    });

    // Read the concatenated output file
    const finalBuffer = await fs.readFile(outputFilePath);

    // Get actual duration from concatenated file using ffprobe
    const duration = await probeAudioDuration(outputFilePath);

    logger.info(
      {
        inputChunks: audioBuffers.length,
        outputSize: finalBuffer.length,
        durationSeconds: duration,
        durationMinutes: Math.floor(duration / 60),
        durationSecondsRemainder: Math.round(duration % 60),
      },
      'Audio concatenation complete with actual duration'
    );

    return { buffer: finalBuffer, durationSeconds: duration };
  } catch (error) {
    logger.error(
      { error, tempDir },
      'Error during audio concatenation'
    );
    throw error;
  } finally {
    // Clean up all temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.debug({ tempDir }, 'Cleaned up temporary files');
    } catch (cleanupError) {
      logger.warn(
        { error: cleanupError, tempDir },
        'Failed to clean up temporary files'
      );
    }
  }
}
