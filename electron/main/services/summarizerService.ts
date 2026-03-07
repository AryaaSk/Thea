// LLM summarization service for TTS output (streaming)
import { apiKeyManager } from '../managers/apiKeyManager.js';

const SYSTEM_PROMPT = `You are a TTS summarizer for a blind user's accessibility assistant. Condense the assistant's response into 1-3 short spoken sentences (max 40 words total).

Rules:
- If the assistant asks the user a question or needs input, you MUST include that question. This is the highest priority.
- If there is an error or warning, state it clearly.
- If the task completed successfully, say what was done in one sentence.
- If the assistant lists options or results, mention the top 2-3 items only.
- Never use markdown, bullet points, URLs, code, or special characters.
- Write all currency as spoken words (e.g. "1 pound" not "£1", "5 dollars" not "$5").
- Write small numbers as spoken words (e.g. "three" not "3"). Digits are fine for large numbers.
- Never use symbols like &, %, @, # — write them as words ("and", "percent", "at", "number").
- Never use abbreviations — write "for example" not "e.g.", "that is" not "i.e.".
- Spell out filenames, extensions, and technical terms letter by letter with spaces (e.g. "a b c dot t x t" not "abc.txt", "h t m l" not "HTML").
- Spell out URLs and paths letter by letter with spaces (e.g. "g o o g l e dot c o m" not "google.com").
- Write in natural spoken English for text-to-speech.
- Do not add filler like "Sure!" or "Here's a summary".`;

class SummarizerService {
  /**
   * Stream-summarize the assistant message. Calls onSentence() for each
   * complete sentence as it arrives so TTS can start speaking immediately.
   * Returns the full summary text when done.
   */
  async summarizeStreaming(params: {
    assistantMessage: string;
    userInstruction: string;
    onSentence: (sentence: string) => void;
  }): Promise<string> {
    const apiKey = apiKeyManager.getWhisperKey();

    if (!apiKey) {
      throw new Error('OpenAI API key not configured (set Whisper key in settings)');
    }

    const userMessage = `User's request: ${params.userInstruction}\n\nAssistant's full response:\n${params.assistantMessage}\n\nSummarize this for text-to-speech.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';
    let sentenceBuffer = '';
    let leftover = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      leftover += decoder.decode(value, { stream: true });
      const lines = leftover.split('\n');
      leftover = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload) as {
            choices: Array<{ delta: { content?: string } }>;
          };
          const token = parsed.choices?.[0]?.delta?.content;
          if (!token) continue;

          fullText += token;
          sentenceBuffer += token;

          // Flush complete sentences to TTS immediately
          const sentenceMatch = sentenceBuffer.match(/^(.*?[.!?])\s*(.*)/s);
          if (sentenceMatch) {
            const completeSentence = sentenceMatch[1].trim();
            sentenceBuffer = sentenceMatch[2];
            if (completeSentence) {
              params.onSentence(completeSentence);
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    // Flush any remaining text
    if (sentenceBuffer.trim()) {
      params.onSentence(sentenceBuffer.trim());
    }

    console.log('[Summarizer] Output:', fullText);
    return fullText;
  }
}

export const summarizerService = new SummarizerService();
