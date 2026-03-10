/**
 * Gemini Batch Image Provider - Vertex AI Batch Prediction for scene images
 * Implements IImageProvider batch methods for scheduled continuations.
 * Uses Gemini 2.5 Flash Image model via Vertex AI batch prediction API.
 *
 * Requires: BATCH_IMAGE_GCS_BUCKET, GOOGLE_CLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS
 */

import type {
  IImageProvider,
  ImageBatchRequest,
  BatchJob,
  BatchStatus,
  BatchResult,
} from '../../base/IImageProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { GoogleAuth } from 'google-auth-library';
import { Storage } from '@google-cloud/storage';
import { JobServiceClient } from '@google-cloud/aiplatform';

const BATCH_MODEL = 'gemini-2.5-flash-image';

export class GeminiBatchImageProvider implements IImageProvider {
  private auth: GoogleAuth;
  private storage: Storage;
  private jobClient: JobServiceClient;
  private projectId: string;
  private location: string;
  private bucketName: string;

  constructor() {
    this.projectId = config.image.gemini.projectId;
    this.location = config.image.gemini.location;
    this.bucketName = config.image.gemini.batchGcsBucket || '';

    if (!this.projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT required for Gemini batch. Set BATCH_IMAGE_GCS_BUCKET for batch support.');
    }
    if (!this.bucketName) {
      throw new Error('BATCH_IMAGE_GCS_BUCKET required for Gemini batch image generation.');
    }

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    this.storage = new Storage();
    this.jobClient = new JobServiceClient({
      apiEndpoint: `${this.location}-aiplatform.googleapis.com`,
    });

    logger.info(
      { projectId: this.projectId, location: this.location, bucket: this.bucketName },
      'Gemini Batch Image Provider initialized'
    );
  }

  /**
   * Required by IImageProvider - not used for batch-only provider.
   * Batch worker uses createImageBatch only.
   */
  async generateImage(): Promise<never> {
    throw new Error('GeminiBatchImageProvider is for batch only. Use createImageBatch for scene images.');
  }

  async createImageBatch(requests: ImageBatchRequest[]): Promise<BatchJob> {
    if (requests.length === 0) {
      throw new Error('createImageBatch requires at least one request');
    }

    const prefix = `batch/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = `${prefix}/input.jsonl`;
    const outputPrefix = `gs://${this.bucketName}/${prefix}/output`;

    const jsonlLines = requests.map((req) => {
      const content: Record<string, unknown> = {
        key: req.customId,
        request: {
          contents: [
            {
              role: 'user',
              parts: [
                { text: req.systemInstruction ? `${req.systemInstruction}\n\n${req.prompt}` : req.prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            topP: 1,
            maxOutputTokens: 8192,
            responseModalities: ['image', 'text'],
            responseMimeType: 'image/png',
          },
        },
      };
      return JSON.stringify(content);
    });

    const jsonlContent = jsonlLines.join('\n');
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(inputPath);
    await file.save(jsonlContent, { contentType: 'application/jsonl' });

    const inputUri = `gs://${this.bucketName}/${inputPath}`;

    const parent = `projects/${this.projectId}/locations/${this.location}`;
    const [job] = await this.jobClient.createBatchPredictionJob({
      parent,
      batchPredictionJob: {
        displayName: `scheduled-continuation-${Date.now()}`,
        model: `publishers/google/models/${config.image.gemini.batchModel || BATCH_MODEL}`,
        inputConfig: {
          gcsSource: { uris: [inputUri] },
          instancesFormat: 'jsonl',
        },
        outputConfig: {
          gcsDestination: { outputUriPrefix: outputPrefix },
          predictionsFormat: 'jsonl',
        },
      },
    });

    if (!job.name) {
      throw new Error('Batch job created but no name returned');
    }

    const batchId = job.name.split('/').pop() || job.name;
    const state = job.state?.toString() || 'JOB_STATE_PENDING';
    const status = state === 'JOB_STATE_PENDING' || state === 'JOB_STATE_RUNNING' ? 'in_progress' : 'validating';

    logger.info({ batchId, requestCount: requests.length, inputUri }, 'Batch image job created');

    return {
      batchId: job.name,
      status: status === 'in_progress' ? 'in_progress' : 'validating',
    };
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const [job] = await this.jobClient.getBatchPredictionJob({ name: batchId });

    const state = job.state?.toString() || 'UNKNOWN';
    let status: BatchStatus['status'] = 'validating';
    if (state === 'JOB_STATE_PENDING' || state === 'JOB_STATE_RUNNING') {
      status = 'in_progress';
    } else if (state === 'JOB_STATE_SUCCEEDED') {
      status = 'completed';
    } else if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED') {
      status = 'failed';
    }

    return {
      batchId,
      status,
      errorMessage: job.error ? (job.error as any).message : undefined,
    };
  }

  async getBatchResults(batchId: string): Promise<BatchResult[]> {
    const [job] = await this.jobClient.getBatchPredictionJob({ name: batchId });
    const outputConfig = job.outputConfig?.gcsDestination;
    if (!outputConfig?.outputUriPrefix) {
      throw new Error(`Batch job ${batchId} has no output config`);
    }

    const prefix = outputConfig.outputUriPrefix.replace(`gs://${this.bucketName}/`, '');
    const [files] = await this.storage.bucket(this.bucketName).getFiles({ prefix });

    const results: BatchResult[] = [];
    for (const file of files) {
      if (!file.name.endsWith('.jsonl')) continue;
      const [content] = await file.download();
      const lines = content.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          const status = row.status;
          const customId = row.key || row.request?.key;
          if (status && status !== '') {
            results.push({ customId: customId || 'unknown', error: status });
            continue;
          }
          const response = row.response;
          const candidates = response?.candidates;
          const parts = candidates?.[0]?.content?.parts;

          let imageData: Buffer | undefined;
          let mimeType: string | undefined;

          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                imageData = Buffer.from(part.inlineData.data, 'base64');
                mimeType = part.inlineData.mimeType || 'image/png';
                break;
              }
            }
          }

          results.push({
            customId: customId || 'unknown',
            imageData,
            mimeType,
          });
        } catch (err) {
          logger.warn({ err, line: line.substring(0, 200) }, 'Failed to parse batch result line');
        }
      }
    }

    return results;
  }
}
