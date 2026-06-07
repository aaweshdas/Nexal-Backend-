import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// ─── Deepgram API Key Pool ─────────────────────────────────────────
// Reads DEEPGRAM_API_KEY_1 … _5 (plus legacy DEEPGRAM_API_KEY).
// Automatically rotates to next key when a connection fails with
// auth errors (close code 1008 / 403) or connection errors.

function loadDgKeyPool(): string[] {
  const pool: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const key = process.env[`DEEPGRAM_API_KEY_${i}`]?.trim();
    if (key) pool.push(key);
  }
  // Legacy single-key support
  if (pool.length === 0) {
    const legacy = process.env.DEEPGRAM_API_KEY?.trim();
    if (legacy) pool.push(legacy);
  }
  return pool;
}

const DG_KEY_POOL: string[] = loadDgKeyPool();
let _dgActiveIndex = 0;
let _dgRuntimeKey: string | null = null;

export function setDeepgramKey(key: string): void {
  _dgRuntimeKey = key;
  console.log('[Deepgram] API key updated at runtime');
}

export function getDeepgramKey(): string {
  if (_dgRuntimeKey) return _dgRuntimeKey;
  if (DG_KEY_POOL.length === 0) return process.env.DEEPGRAM_API_KEY ?? '';
  return DG_KEY_POOL[_dgActiveIndex];
}

function rotateDgKey(): boolean {
  if (_dgRuntimeKey) return false; // runtime override — don't rotate
  if (DG_KEY_POOL.length <= 1) return false;
  const next = _dgActiveIndex + 1;
  if (next >= DG_KEY_POOL.length) {
    console.error('[Deepgram] ⚠️  All API keys exhausted. No more fallbacks.');
    return false;
  }
  _dgActiveIndex = next;
  console.log(`[Deepgram] 🔄 Rotating to API key ${_dgActiveIndex + 1} of ${DG_KEY_POOL.length}`);
  return true;
}

/** True if the close code / error suggests an auth/quota failure */
function isAuthError(code: number | undefined, reason: string): boolean {
  if (code === 1008 || code === 1003 || code === 4001) return true;
  const r = reason.toLowerCase();
  return r.includes('auth') || r.includes('invalid') || r.includes('forbidden') || r.includes('quota');
}

// ─── Deepgram Streaming STT Client ───────────────────────────────────
// Manages a single WebSocket session to Deepgram's live-transcription API.
// Reconnects with the next key automatically when the current key fails.

export class DeepgramStreamingClient {
  private _onFinal: (transcript: string, isSpeechFinal: boolean) => Promise<void>;
  private _ws: WebSocket | null = null;
  private _connected = false;
  private _totalAudioBytes = 0;
  private _closing = false;
  private _onError?: (msg: string) => void;

  private static readonly _BASE_URL =
    'wss://api.deepgram.com/v1/listen' +
    '?model=nova-2' +
    '&language=en-US' +
    '&encoding=linear16' +
    '&sample_rate=16000' +
    '&channels=1' +
    '&smart_format=true' +
    '&interim_results=true' +
    '&endpointing=1000' +
    '&utterance_end_ms=1500' +
    '&vad_events=true' +
    '&no_delay=true';

  constructor(
    onFinalTranscript: (transcript: string, isSpeechFinal: boolean) => Promise<void>,
    onErrorCallback?: (msg: string) => void,
  ) {
    this._onFinal = onFinalTranscript;
    this._onError = onErrorCallback;
  }

  get isConnected(): boolean {
    return this._connected && this._ws !== null && this._ws.readyState === WebSocket.OPEN;
  }

  /**
   * Open WebSocket connection to Deepgram.
   * Tries the current key; on auth failure rotates and retries once.
   * Returns true on success.
   */
  async connect(retryOnAuthFail = true): Promise<boolean> {
    this._closing = false;
    const apiKey = getDeepgramKey();

    if (!apiKey) {
      console.error('[STT] No Deepgram API key configured');
      return false;
    }

    return new Promise((resolve) => {
      try {
        this._ws = new WebSocket(DeepgramStreamingClient._BASE_URL, {
          headers: { Authorization: `Token ${apiKey}` },
        });

        this._ws.on('open', () => {
          this._connected = true;
          this._totalAudioBytes = 0;
          console.log(`[STT] Deepgram WebSocket connected (key index ${_dgActiveIndex + 1}/${DG_KEY_POOL.length})`);
          resolve(true);
        });

        this._ws.on('message', (data: WebSocket.Data) => {
          if (typeof data !== 'string') return;
          try {
            const msg = JSON.parse(data);
            const msgType = msg.type || '';

            if (msgType === 'Results') {
              const isFinal    = msg.is_final === true;
              const speechFinal = msg.speech_final === true;
              const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim() || '';

              if (transcript && isFinal) {
                console.log(`[STT] Chunk (speech_final=${speechFinal}): "${transcript}"`);
                this._onFinal(transcript, speechFinal).catch((e) =>
                  console.error('[STT] Transcript callback error:', e)
                );
              }
            }
          } catch (_) {}
        });

        this._ws.on('error', async (err) => {
          console.error('[STT] Deepgram WebSocket error:', err.message);
          this._connected = false;

          if (retryOnAuthFail && rotateDgKey()) {
            console.log('[STT] Retrying connection with next key...');
            resolve(await this.connect(false)); // one retry with new key
          } else {
            this._onError?.('Deepgram STT connection failed. All keys may be exhausted.');
            resolve(false);
          }
        });

        this._ws.on('close', async (code, reason) => {
          const reasonStr = reason.toString();
          console.log(`[STT] Deepgram closed — code=${code} reason="${reasonStr}" totalAudio=${(this._totalAudioBytes / 1024).toFixed(1)}KB`);
          this._connected = false;

          if (!this._closing && retryOnAuthFail && isAuthError(code, reasonStr) && rotateDgKey()) {
            console.log('[STT] Auth error detected — retrying with next key...');
            resolve(await this.connect(false));
          }
        });
      } catch (e) {
        console.error('[STT] Connection exception:', e);
        this._connected = false;
        resolve(false);
      }
    });
  }

  /** Send a raw PCM16 buffer to Deepgram. */
  sendAudio(pcmBuffer: Buffer): void {
    if (!this.isConnected || !this._ws) return;
    try {
      this._ws.send(pcmBuffer);
      this._totalAudioBytes += pcmBuffer.length;
    } catch (e) {
      console.error('[STT] Send error:', e);
      this._connected = false;
    }
  }

  /** Close the connection cleanly. */
  async close(): Promise<void> {
    this._closing = true;
    this._connected = false;
    if (this._ws) {
      try {
        if (this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(JSON.stringify({ type: 'CloseStream' }));
          await new Promise((r) => setTimeout(r, 100));
          this._ws.close();
        }
      } catch (_) {}
      this._ws = null;
    }
  }
}

// ─── Text-to-Speech (Deepgram Aura-2 Helena) ─────────────────────────
// Also uses the key pool — rotates on HTTP 401/403/429.

export async function generateSpeech(text: string): Promise<Buffer | null> {
  if (!text?.trim()) return null;

  for (let attempt = 0; attempt < DG_KEY_POOL.length || attempt === 0; attempt++) {
    const apiKey = getDeepgramKey();
    if (!apiKey) { console.error('[TTS] No Deepgram API key set'); return null; }

    try {
      const t0 = performance.now();
      const response = await fetch(
        'https://api.deepgram.com/v1/speak' +
          '?model=aura-2-helena-en' +
          '&encoding=linear16' +
          '&container=wav' +
          '&sample_rate=24000',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        }
      );

      if (response.status === 401 || response.status === 403 || response.status === 429) {
        const errText = await response.text();
        console.warn(`[TTS] Key ${_dgActiveIndex + 1} failed (${response.status}): ${errText.slice(0, 120)}`);
        if (!rotateDgKey()) return null;
        continue; // retry with next key
      }

      if (response.status !== 200) {
        console.error(`[TTS] API error ${response.status}: ${(await response.text()).slice(0, 200)}`);
        return null;
      }

      const buf = Buffer.from(await response.arrayBuffer());
      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`[TTS] Generated ${Math.round(buf.length / 1024)}KB in ${elapsed}s`);
      return buf;
    } catch (e) {
      console.error('[TTS] Exception:', e);
      return null;
    }
  }

  return null;
}

// ─── STT Health Check ─────────────────────────────────────────────────
export async function checkDeepgramSttHealth(): Promise<{ ok: boolean; keyIndex: number; total: number; error?: string }> {
  const apiKey = getDeepgramKey();
  if (!apiKey) return { ok: false, keyIndex: 0, total: 0, error: 'No Deepgram key configured' };

  return new Promise((resolve) => {
    const ws = new WebSocket(
      'wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000',
      { headers: { Authorization: `Token ${apiKey}` } }
    );
    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ ok: false, keyIndex: _dgActiveIndex + 1, total: DG_KEY_POOL.length, error: 'Connection timed out' });
    }, 6000);
    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve({ ok: true, keyIndex: _dgActiveIndex + 1, total: DG_KEY_POOL.length });
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, keyIndex: _dgActiveIndex + 1, total: DG_KEY_POOL.length, error: e.message });
    });
  });
}

export function getTtsStatus(): { loaded: boolean; model: string; voice: string; type: string; sample_rate: number; keys: number } {
  return {
    loaded: true,
    model: 'aura-2-helena-en',
    voice: 'Helena',
    type: 'cloud',
    sample_rate: 24000,
    keys: DG_KEY_POOL.length,
  };
}
