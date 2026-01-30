# Imagen 3 API Setup Guide

## Overview

The image generation service uses Google's Imagen 3 via Vertex AI REST API with two models:
- **imagen-3.0-generate-002**: For basic text-to-image generation (supports aspect ratio)
- **imagen-3.0-capability-001**: For generation with reference images (character consistency)

## Prerequisites

1. **Google Cloud Project** with Vertex AI API enabled
2. **Service Account** with `Vertex AI User` role
3. **Authentication** set up for the service

## Setup Steps

### 1. Enable Vertex AI API

```bash
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
```

### 2. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create imagen-service \
    --display-name="Imagen 3 Service Account" \
    --project=YOUR_PROJECT_ID

# Grant Vertex AI User role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:imagen-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Create and download key
gcloud iam service-accounts keys create ./imagen-service-key.json \
    --iam-account=imagen-service@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 3. Set Environment Variables

Add to your `.env` file:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/imagen-service-key.json

# Or for Application Default Credentials (ADC)
# Run: gcloud auth application-default login
```

### 4. Test Authentication

```bash
# Test with gcloud
gcloud auth application-default login

# Or verify service account
gcloud auth activate-service-account \
    --key-file=/path/to/imagen-service-key.json
```

## Image Generation Flows

### Flow 0: Character Portraits (Premium)
- **Model**: `imagen-3.0-generate-002`
- **Parameters**: 
  - `aspectRatio: "1:1"`
  - `personGeneration: "allow_all"` (allows children and all ages)
- **Output**: Square portraits (1024x1024) saved to `assets` and `generated_references`

### Flow 1: Scenes Without References
- **Model**: `imagen-3.0-generate-002`
- **Parameters**: 
  - `aspectRatio: "16:9"`
  - `personGeneration: "allow_all"` (allows children and all ages)
- **Output**: Scene images (1024x576) with character descriptions in prompt

### Flow 2: Scenes With References
- **Model**: `imagen-3.0-capability-001`
- **Parameters**: 
  - `referenceImages`: Array of base64-encoded images (max 4)
  - `subjectType`: "SUBJECT_TYPE_PERSON"
  - `personGeneration: "allow_all"` (allows children and all ages)
- **Note**: Does NOT support `aspectRatio`, outputs default size (typically 1024x1024)

## Reference Image Format

Reference images must be:
- **Base64-encoded** PNG, JPEG, GIF, or BMP
- **Max size**: 20MB per image
- **Max count**: 4 images per request
- **Downloaded** from storage URLs and converted on-the-fly

## Prompt Format for References

When using capability model, include reference IDs in prompt:

```
Generate an image about the child [1] in this scene...
```

Where `[1]` corresponds to `referenceId: 1` in the API request.

## Error Handling

Common errors:
- **401 Unauthorized**: Check `GOOGLE_APPLICATION_CREDENTIALS` path
- **403 Forbidden**: Verify service account has `roles/aiplatform.user`
- **429 Rate Limit**: Handled automatically by rate limiter
- **500 Server Error**: Retried automatically (max 3 attempts)

## Monitoring

Check logs for:
- Model selection (generate vs capability)
- Reference image conversion status
- API response times
- Rate limit status

## Cost Optimization

- **Flow 0 (Portraits)**: ~$0.04 per image (1:1)
- **Flow 1 (Scenes)**: ~$0.04 per image (16:9)
- **Flow 2 (With References)**: ~$0.08 per image (capability model)

Estimated cost per story:
- Basic plan (no portraits): 3-6 images = $0.12-$0.24
- Premium plan (with portraits): 2-3 portraits + 3-6 scenes = $0.32-$0.56

## Troubleshooting

### "Failed to obtain access token"
```bash
# Re-authenticate
gcloud auth application-default login

# Or check service account key
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

### "Project ID not set"
```bash
# Set in environment
export GOOGLE_CLOUD_PROJECT=your-project-id
```

### "Reference image download failed"
- Check storage URL accessibility
- Verify image format (PNG, JPEG, GIF, BMP)
- Ensure image size < 20MB

## Development vs Production

### Development
```bash
# Use Application Default Credentials
gcloud auth application-default login
unset GOOGLE_APPLICATION_CREDENTIALS
```

### Production
```bash
# Use Service Account Key
export GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/imagen-key.json
```

## Links

- [Vertex AI Imagen 3 Docs](https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images)
- [Subject Customization Guide](https://cloud.google.com/vertex-ai/generative-ai/docs/image/subject-customization)
- [Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
