import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import {
  chatCompletion,
  clearHistory,
  checkGroqHealth,
  setGroqKey,
  getGroqKey,
  getTtsQueue,
} from './services/groq.service.js';

import {
  DeepgramStreamingClient,
  generateSpeech,
  getTtsStatus,
  setDeepgramKey,
  getDeepgramKey,
  checkDeepgramSttHealth,
} from './services/deepgram.service.js';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e7, // 10MB payload size limit
});

const PORT = parseInt(process.env.PORT || '3003', 10);

// ─── REST Endpoints ───────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const groq = await checkGroqHealth();
  const stt  = await checkDeepgramSttHealth();
  res.json({
    status: 'online',
    name: 'ARIA — Neural Companion',
    timestamp: new Date().toISOString(),
    model: 'llama-3.1-8b-instant',
    stt_model: 'deepgram-nova-2-streaming',
    stt,
    tts: getTtsStatus(),
    groq,
  });
});

app.get('/config', (req, res) => {
  const groqKey = getGroqKey();
  const dgKey = getDeepgramKey();
  res.json({
    groq_key_set: !!groqKey,
    groq_key_masked: groqKey.length > 6 ? `...${groqKey.substring(groqKey.length - 6)}` : 'not set',
    deepgram_key_set: !!dgKey,
    deepgram_key_masked: dgKey.length > 6 ? `...${dgKey.substring(dgKey.length - 6)}` : 'not set',
  });
});

// ─── STT Junk Filter ──────────────────────────────────────────────
const JUNK_SET = new Set([
  'you', 'the end', 'thanks for watching', '...', '…', 'ugh', 'huh',
  '[music]', '[applause]', '[laughter]', 'thank you', 'thanks', 'ok',
  'okay', 'sure', 'yes', 'bye', 'right', 'alright', 'welcome',
  '.', ',', '!', '?', 'um', 'uh', 'hmm'
]);
const JUNK_RE = /^(thank you|thanks|okay|ok|you|yes|no|bye|the end)[\s.!]*$/i;

function isJunk(text: string): boolean {
  const t = text.trim();
  if (JUNK_SET.has(t.toLowerCase())) return true;
  if (JUNK_RE.test(t)) return true;
  if (t.length < 3 && !/^(hi|hey|yo|go)$/i.test(t)) return true;
  return false;
}

// ─── Per-Client State ─────────────────────────────────────────────
interface ClientState {
  isProcessing: boolean;
  sessionTranscript: string;
  llmTriggered: boolean;
}

const clientStates = new Map<string, ClientState>();
const streamingClients = new Map<string, DeepgramStreamingClient>();

// ─── LLM → TTS pipeline ───────────────────────────────────────────
async function runLlmTts(sid: string, text: string, imageBase64?: string) {
  const s = clientStates.get(sid);
  if (!s || s.isProcessing) return;

  s.isProcessing = true;
  try {
    io.to(sid).emit('processing_start');
    if (imageBase64) {
      console.log(`[LLM] >>> "${text}" + [Image Data]`);
    } else {
      console.log(`[LLM] >>> "${text}"`);
    }

    const response = await chatCompletion(sid, text, io, imageBase64);
    const reply = response.text || '';

    io.to(sid).emit('ai_response', {
      text: reply,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[Pipeline] Error:`, e);
    io.to(sid).emit('error', {
      message: 'Processing failed',
      detail: String(e),
    });
  } finally {
    s.isProcessing = false;
  }
}

// ─── Deepgram transcript callback factory ─────────────────────────
function makeTranscriptCallback(sid: string) {
  return async (transcript: string, isSpeechFinal: boolean) => {
    const s = clientStates.get(sid);
    if (!s) return;

    if (isJunk(transcript)) {
      console.log(`[STT] Junk filtered: "${transcript}"`);
      return;
    }

    console.log(`[STT] Segment (speech_final=${isSpeechFinal}): "${transcript}"`);

    // Accumulate the transcript segment
    s.sessionTranscript = (s.sessionTranscript ? s.sessionTranscript + ' ' : '') + transcript;

    // Emit accumulated transcript in real-time to Flutter with isFinal: false
    io.to(sid).emit('transcript', {
      text: s.sessionTranscript,
      isFinal: false,
      timestamp: new Date().toISOString(),
    });

    // If Deepgram fires speech_final and safety latch is not triggered yet, trigger LLM
    if (isSpeechFinal && !s.llmTriggered && s.sessionTranscript.trim()) {
      s.llmTriggered = true;
      console.log(`[STT] Auto-triggering LLM via silence endpoint: "${s.sessionTranscript}"`);

      // Emit final transcript status to frontend
      io.to(sid).emit('transcript', {
        text: s.sessionTranscript,
        isFinal: true,
        timestamp: new Date().toISOString(),
      });

      runLlmTts(sid, s.sessionTranscript).catch((e) =>
        console.error(`[Pipeline] Async trigger error:`, e)
      );
    }
  };
}

// ─── Socket.IO Connection ─────────────────────────────────────────
io.on('connection', (socket: Socket) => {
  const sid = socket.id;
  console.log(`[Socket] Connected: ${sid}`);

  clientStates.set(sid, {
    isProcessing: false,
    sessionTranscript: '',
    llmTriggered: false,
  });

  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${sid}`);
    clearHistory(sid);
    clientStates.delete(sid);

    // Close Deepgram WebSocket if active
    const client = streamingClients.get(sid);
    if (client) {
      streamingClients.delete(sid);
      await client.close();
    }
  });

  socket.on('start_stream', async () => {
    if (streamingClients.has(sid)) return;

    const apiKey = getDeepgramKey();
    if (!apiKey) {
      socket.emit('error', { message: 'DEEPGRAM_API_KEY not configured' });
      return;
    }

    // Reset session transcription state for a fresh recording session
    const state = clientStates.get(sid);
    if (state) {
      state.sessionTranscript = '';
      state.llmTriggered = false;
    }

    const callback = makeTranscriptCallback(sid);
    const onSttError = (msg: string) => socket.emit('error', { message: msg });
    const client = new DeepgramStreamingClient(callback, onSttError);
    const ok = await client.connect();

    if (ok) {
      streamingClients.set(sid, client);
      console.log(`[Socket] Deepgram STT stream opened for ${sid}`);
      socket.emit('stt_ready'); // tell Flutter STT is live
    } else {
      const errMsg = 'Could not connect to Deepgram STT. Please check your Deepgram API key in Settings.';
      console.error(`[Socket] Deepgram STT connection FAILED for ${sid}`);
      socket.emit('error', { message: errMsg });
    }
  });

  socket.on('stop_stream', async () => {
    const client = streamingClients.get(sid);
    const state = clientStates.get(sid);

    // If manual stop is clicked before silence endpoint triggered the LLM, trigger it now
    if (state && state.sessionTranscript.trim() && !state.llmTriggered) {
      state.llmTriggered = true;
      console.log(`[STT] Manual trigger via stop_stream: "${state.sessionTranscript}"`);

      // Emit final transcript to frontend
      io.to(sid).emit('transcript', {
        text: state.sessionTranscript,
        isFinal: true,
        timestamp: new Date().toISOString(),
      });

      // Run LLM pipeline
      runLlmTts(sid, state.sessionTranscript).catch((e) =>
        console.error(`[Pipeline] stop_stream trigger error:`, e)
      );
    }

    if (client) {
      streamingClients.delete(sid);
      await client.close();
      console.log(`[Socket] Deepgram stream closed for ${sid}`);
    }
  });

  socket.on('audio_stream', (audioData: any) => {
    const client = streamingClients.get(sid);
    if (!client) {
      console.warn(`[STT] audio_stream received but no Deepgram client for ${sid} — did start_stream fire?`);
      return;
    }

    let buf: Buffer | null = null;

    if (Buffer.isBuffer(audioData)) {
      buf = audioData;
    } else if (audioData instanceof ArrayBuffer) {
      buf = Buffer.from(audioData);
    } else if (Array.isArray(audioData)) {
      buf = Buffer.from(audioData);
    } else if (audioData instanceof Uint8Array) {
      buf = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    } else if (audioData !== null && typeof audioData === 'object') {
      // Dart socket.io client may send binary as a plain object with numeric keys
      try {
        const values = Object.values(audioData) as number[];
        if (values.length > 0 && typeof values[0] === 'number') {
          buf = Buffer.from(values);
        } else {
          console.warn(`[STT] audio_stream: unhandled object type, keys=${Object.keys(audioData).length}`);
        }
      } catch (e) {
        console.warn('[STT] audio_stream: failed to convert object to buffer:', e);
      }
    } else {
      console.warn(`[STT] audio_stream: unknown data type: ${typeof audioData}`);
    }

    if (buf && buf.length > 0) {
      client.sendAudio(buf);
    }
  });

  socket.on('text_input', (data: any) => {
    const s = clientStates.get(sid);
    if (!s) return;

    const text = (typeof data === 'string' ? data : data?.text || '').trim();
    const imageBase64 = data?.image;

    if (!text && !imageBase64) return;

    // NOTE: No transcript echo here — the Flutter client already renders
    // the user's message via _sendMessage(). Echoing caused duplicates.
    runLlmTts(sid, text, imageBase64).catch((e) =>
      console.error(`[Pipeline] Async text processing error:`, e)
    );
  });

  socket.on('trigger_tts', (data: any) => {
    const text = (typeof data === 'string' ? data : data?.text || '').trim();
    if (!text) return;
    
    console.log(`[Socket] Manual TTS triggered for: "${text.substring(0, 50)}..."`);
    const ttsQueue = getTtsQueue(sid, io);
    ttsQueue.clear();
    io.to(sid).emit('tts_start');
    
    // Split text into sentences for streaming synthesis
    const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
    for (const sentence of sentences) {
      if (sentence.trim().length > 0) {
        ttsQueue.push(sentence.trim());
      }
    }
  });

  socket.on('clear_history', () => {
    clearHistory(sid);
    socket.emit('history_cleared');
  });

  socket.on('update_config', (data: any) => {
    if (typeof data !== 'object' || !data) return;

    const groqKey = (data.groqApiKey || '').trim();
    const dgKey = (data.deepgramApiKey || '').trim();

    if (groqKey) setGroqKey(groqKey);
    if (dgKey) setDeepgramKey(dgKey);

    socket.emit('config_updated', {
      groq_key_set: !!(groqKey || getGroqKey()),
      deepgram_key_set: !!(dgKey || getDeepgramKey()),
      timestamp: new Date().toISOString(),
    });
    console.log(`[Config] API keys updated from Flutter client ${sid}`);
  });
});

// ─── Start Server ─────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log();
  console.log('=======================================================');
  console.log('  ARIA — Neural AI Companion (Node.js/TypeScript Backend)');
  console.log(`  Port    : ${PORT}`);
  console.log(`  LLM     : llama-3.1-8b-instant (Groq)`);
  console.log(`  STT     : Deepgram Nova-2 WebSocket Streaming`);
  console.log(`  TTS     : Deepgram Aura-2 Helena`);
  console.log(`  WS      : ws://localhost:${PORT}`);
  console.log(`  Health  : http://localhost:${PORT}/health`);
  console.log('=======================================================');
  console.log();
});
