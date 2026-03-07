// OpenAI Whisper API transcription service
import { apiKeyManager } from '../managers/apiKeyManager.js';

class WhisperService {
  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    const apiKey = apiKeyManager.getWhisperKey();
    if (!apiKey) {
      throw new Error('Whisper API key not configured');
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'wav';

    // Build multipart form data manually for Node.js
    const boundary = '----SightlineFormBoundary' + Date.now();
    const parts: Buffer[] = [];

    // File part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    ));
    parts.push(audioBuffer);
    parts.push(Buffer.from('\r\n'));

    // Model part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`
    ));

    // Closing boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { text: string };
    return result.text;
  }
}

export const whisperService = new WhisperService();
