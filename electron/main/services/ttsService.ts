// ElevenLabs TTS service with queued speech for continuous narration
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { apiKeyManager } from '../managers/apiKeyManager.js';

const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Rachel - clear, calm
const MODEL_ID = 'eleven_turbo_v2_5';

class TtsService {
  private speechQueue: string[] = [];
  private isPlaying = false;
  private currentProcess: ChildProcess | null = null;
  private stopped = false;

  async speak(text: string): Promise<void> {
    if (!text.trim()) return;
    this.speechQueue.push(text);
    if (!this.isPlaying) {
      this.processQueue();
    }
  }

  async speakImmediate(text: string): Promise<void> {
    this.speechQueue = [];
    this.killCurrentPlayback();
    if (!text.trim()) return;
    await this.playText(text);
  }

  stop(): void {
    this.stopped = true;
    this.speechQueue = [];
    this.killCurrentPlayback();
    this.stopped = false;
  }

  isSpeaking(): boolean {
    return this.isPlaying;
  }

  private async processQueue(): Promise<void> {
    this.isPlaying = true;

    while (this.speechQueue.length > 0 && !this.stopped) {
      const text = this.speechQueue.shift()!;
      try {
        await this.playText(text);
      } catch (error) {
        console.error('[TTS] Error playing text:', error);
      }
    }

    this.isPlaying = false;
  }

  private async playText(text: string): Promise<void> {
    const apiKey = apiKeyManager.getElevenLabsKey();
    if (!apiKey) {
      console.warn('[TTS] No ElevenLabs API key configured');
      return;
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          speed: 1.2,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS] ElevenLabs API error:', response.status, errorText);
        return;
      }

      // Write audio to temp file and play
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const tmpPath = path.join(os.tmpdir(), `sightline-tts-${Date.now()}.mp3`);
      fs.writeFileSync(tmpPath, audioBuffer);

      await this.playAudioFile(tmpPath);

      // Cleanup temp file
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    } catch (error) {
      console.error('[TTS] Failed to synthesize speech:', error);
    }
  }

  private playAudioFile(filePath: string): Promise<void> {
    return new Promise((resolve) => {
      let command: string;
      let args: string[];

      if (process.platform === 'darwin') {
        command = 'afplay';
        args = [filePath];
      } else if (process.platform === 'win32') {
        command = 'powershell';
        args = ['-c', `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`];
      } else {
        command = 'aplay';
        args = [filePath];
      }

      this.currentProcess = spawn(command, args, { stdio: 'ignore' });

      this.currentProcess.on('exit', () => {
        this.currentProcess = null;
        resolve();
      });

      this.currentProcess.on('error', (err) => {
        console.error('[TTS] Audio playback error:', err);
        this.currentProcess = null;
        resolve();
      });
    });
  }

  private killCurrentPlayback(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }
}

export const ttsService = new TtsService();
