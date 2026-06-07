import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { generateSpeech } from './deepgram.service.js';

dotenv.config();

// ─── Groq API Key Pool ────────────────────────────────────────────
// Reads up to 5 keys from the environment (GROQ_API_KEY_1 … _5).
// Falls back gracefully if fewer keys are configured.
// Automatically rotates to the next key on quota / rate-limit errors.

function loadKeyPool(): string[] {
  const pool: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`GROQ_API_KEY_${i}`]?.trim();
    if (key) pool.push(key);
  }
  // Also honour the legacy single-key variable so nothing breaks
  if (pool.length === 0) {
    const legacyKey = process.env.GROQ_API_KEY?.trim();
    if (legacyKey) pool.push(legacyKey);
  }
  return pool;
}

const KEY_POOL: string[] = loadKeyPool();
let _activeKeyIndex = 0;
let _groqClient: Groq | null = null;
// Runtime override (set via the app settings UI)
let _runtimeApiKey: string | null = null;

/** Errors that indicate the current key is exhausted and we should try the next */
function isQuotaError(e: any): boolean {
  const status = e?.status ?? e?.statusCode ?? e?.response?.status ?? 0;
  const msg: string = (e?.message ?? String(e)).toLowerCase();
  return (
    status === 429 ||
    status === 402 ||
    msg.includes('rate_limit') ||
    msg.includes('quota') ||
    msg.includes('credits') ||
    msg.includes('insufficient_quota') ||
    msg.includes('exceeded') ||
    msg.includes('billing')
  );
}

function currentKey(): string {
  if (_runtimeApiKey) return _runtimeApiKey;
  if (KEY_POOL.length === 0) return process.env.GROQ_API_KEY ?? '';
  return KEY_POOL[_activeKeyIndex];
}

function rotateKey(): boolean {
  if (_runtimeApiKey) return false; // runtime key is fixed; don't rotate
  if (KEY_POOL.length <= 1) return false;
  const next = _activeKeyIndex + 1;
  if (next >= KEY_POOL.length) {
    console.error('[Groq] ⚠️  All API keys exhausted. No more fallbacks available.');
    return false;
  }
  _activeKeyIndex = next;
  _groqClient = null; // force rebuild with new key
  console.log(`[Groq] 🔄 Rotating to API key ${_activeKeyIndex + 1} of ${KEY_POOL.length}`);
  return true;
}

export function setGroqKey(key: string): void {
  _runtimeApiKey = key;
  _groqClient = null;
  console.log('[Groq] API key updated at runtime');
}

export function getGroqKey(): string {
  return currentKey();
}

export function getGroqClient(): Groq {
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: currentKey() });
  }
  return _groqClient;
}

/** Helper: run a Groq API call with automatic key-rotation on quota errors */
async function withKeyRotation<T>(fn: () => Promise<T>): Promise<T> {
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      if (isQuotaError(e) && rotateKey()) {
        // Rebuild client and retry immediately
        _groqClient = new Groq({ apiKey: currentKey() });
        continue;
      }
      throw e; // non-quota error or no more keys — propagate
    }
  }
}

export const LLM_MODEL = 'llama-3.1-8b-instant';

export const SYSTEM_PROMPT = `You are ARIA — the Neural AI Companion built into the Nexal app, created by Aawesh Das.

PERSONALITY:
  You are brilliant, creative, and warmly confident. You speak like a knowledgeable friend who is genuinely excited about ideas. You are concise but thorough when the user wants depth. No robotic language. Keep responses natural and engaging.

CAPABILITIES:
  - Answer questions on any topic with accuracy and depth
  - Help with coding, writing, analysis, brainstorming, and creative tasks
  - Summarize long content, translate languages, explain complex concepts
  - Provide thoughtful advice and recommendations

STYLE:
  - Be conversational and natural — like talking to a brilliant friend
  - Use clear, clean language without excessive formatting in voice mode
  - When in text mode, you may use light formatting for readability
  - Keep responses concise (2-4 sentences) unless the user asks for detail
  - Show genuine interest and enthusiasm for the topic at hand

RULES:
  - Always be helpful, accurate, and honest
  - If unsure about something, say so clearly
  - Never fabricate information
  - Always reply in English unless the user speaks in another language first`;

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];
}

const conversations = new Map<string, Message[]>();
const MAX_HISTORY = 20;

export function getHistory(socketId: string): Message[] {
  if (!conversations.has(socketId)) {
    conversations.set(socketId, []);
  }
  return conversations.get(socketId)!;
}

export function clearHistory(socketId: string): void {
  conversations.delete(socketId);
  clearTtsQueue(socketId);
}

// Sequential TTS execution queue to prevent out-of-order synthesis packets
export class ClientTtsQueue {
  private queue: Promise<any> = Promise.resolve();
  private activeCount = 0;
  private socketId: string;
  private sio: any;
  private currentGenerationId = 0;

  constructor(socketId: string, sio: any) {
    this.socketId = socketId;
    this.sio = sio;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  push(text: string) {
    const genId = this.currentGenerationId;
    this.activeCount++;
    this.queue = this.queue.then(async () => {
      // If queue was cleared/incremented since this task was queued, skip it!
      if (genId !== this.currentGenerationId) {
        this.activeCount--;
        return;
      }

      try {
        console.log(`[TTS-Queue] Generating sentence speech: "${text}"`);
        const audio = await generateSpeech(text);
        
        // Safety check if user interrupted during Deepgram API call
        if (genId !== this.currentGenerationId) {
          return;
        }

        if (audio && audio.length > 0) {
          console.log(`[TTS-Queue] Emitting chunk: "${text}" (${audio.length} bytes)`);
          this.sio.to(this.socketId).emit('tts_audio', audio);
        }
      } catch (e) {
        console.error(`[TTS-Queue] Error:`, e);
      } finally {
        this.activeCount--;
        if (this.activeCount === 0 && genId === this.currentGenerationId) {
          console.log('[TTS-Queue] All sentences processed. Emitting tts_end.');
          this.sio.to(this.socketId).emit('tts_end');
        }
      }
    });
  }

  clear() {
    this.currentGenerationId++;
    this.queue = Promise.resolve();
    this.activeCount = 0;
  }
}

const ttsQueues = new Map<string, ClientTtsQueue>();

export function getTtsQueue(socketId: string, sio: any): ClientTtsQueue {
  if (!ttsQueues.has(socketId)) {
    ttsQueues.set(socketId, new ClientTtsQueue(socketId, sio));
  }
  return ttsQueues.get(socketId)!;
}

export function clearTtsQueue(socketId: string): void {
  const queue = ttsQueues.get(socketId);
  if (queue) {
    queue.clear();
    ttsQueues.delete(socketId);
  }
}

export async function chatCompletion(
  socketId: string,
  userMessage: string,
  sio?: any,
  imageBase64?: string
): Promise<{ text: string }> {
  const history = getHistory(socketId);
  
  if (imageBase64) {
    history.push({ 
      role: 'user', 
      content: [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: imageBase64 } }
      ]
    });
  } else {
    history.push({ role: 'user', content: userMessage });
  }

  // Limit history length
  if (history.length > MAX_HISTORY) {
    const overflow = history.length - MAX_HISTORY;
    const removeCount = overflow % 2 === 0 ? overflow : overflow + 1;
    history.splice(0, removeCount);
  }

  const isVisionRequest = !!imageBase64;
  const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

  // For non-vision calls, sanitize history: any prior array-content entry (from a
  // vision turn) must be flattened to a plain string so the text model doesn't reject it.
  const sanitizedHistory: Message[] = isVisionRequest
    ? history
    : history.map((msg) => {
        if (Array.isArray(msg.content)) {
          const textPart = (msg.content as any[]).find((p: any) => p.type === 'text');
          return { role: msg.role, content: textPart?.text ?? '[image]' };
        }
        return msg;
      });

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizedHistory,
  ];

  const ttsQueue = sio ? getTtsQueue(socketId, sio) : null;
  
  if (ttsQueue) {
    ttsQueue.clear();
    sio.to(socketId).emit('tts_start');
  }

  try {
    const stream = await withKeyRotation(() =>
      getGroqClient().chat.completions.create({
        model: isVisionRequest ? VISION_MODEL : LLM_MODEL,
        messages: messages as any,
        stream: true,
        max_tokens: 2048,
        temperature: 0.7,
      })
    );

    let fullText = '';
    let sentenceBuffer = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullText += content;
        sentenceBuffer += content;
        if (sio) {
          sio.to(socketId).emit('aria-stream-chunk', content);
        }

        // Sentence-based chunking
        // Matches punctuation (. ? ! or newline) followed by any whitespace or end-of-string
        const sentenceMatch = sentenceBuffer.match(/[^.!?\n]+[.!?\n]+/);
        if (sentenceMatch) {
          const sentence = sentenceMatch[0].trim();
          sentenceBuffer = sentenceBuffer.substring(sentenceMatch[0].length);
          if (sentence.length > 2 && ttsQueue) {
            // Push sentence to sequential TTS queue
            ttsQueue.push(sentence);
          }
        }
      }
    }

    // Process any remaining tail text
    const remaining = sentenceBuffer.trim();
    if (remaining.length > 0 && ttsQueue) {
      ttsQueue.push(remaining);
    }

    // If there were no sentences synthesized at all, terminate the tts session immediately
    if (ttsQueue && ttsQueue.getActiveCount() === 0) {
      sio.to(socketId).emit('tts_end');
    }

    history.push({
      role: 'assistant',
      content: fullText || 'I could not generate a response.',
    });
    return { text: fullText };
  } catch (e: any) {
    const errorMsg = `LLM error: ${e.message || String(e)}`;
    console.error(`[Groq] ${errorMsg}`);

    // Remove the bad user message we just pushed so it doesn't poison future calls
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history.pop();
    }

    if (sio) {
      // Emit a user-friendly error message instead of the raw error
      const friendlyMsg = isVisionRequest
        ? "Sorry, I couldn't analyze that image. Please try again with a different image."
        : "Sorry, something went wrong processing your message. Please try again.";
      sio.to(socketId).emit('aria-stream-chunk', friendlyMsg);
      sio.to(socketId).emit('ai_response', {
        text: friendlyMsg,
        timestamp: new Date().toISOString(),
      });
      sio.to(socketId).emit('tts_end');
    }
    
    return { text: '' };
  }
}

export async function checkGroqHealth(): Promise<{ ok: boolean; model: string; error?: string; availableModels?: number }> {
  try {
    const client = getGroqClient();
    const models = await client.models.list();
    return {
      ok: true,
      model: LLM_MODEL,
      availableModels: models.data?.length || 0,
    };
  } catch (err: any) {
    return { ok: false, model: LLM_MODEL, error: err.message || String(err) };
  }
}
