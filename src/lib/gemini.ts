/**
 * HERA AI Recruitment Engine Client
 * 
 * All Gemini interactions are securely routed through server-side proxy endpoints (/api/interview/*, /api/gemini/*).
 * No API keys are required or exposed in the frontend.
 */

export const GEMINI_TEXT_MODEL = 'gemini-3.8-flash';
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';

export interface InterviewSessionMessage {
  role: 'user' | 'model';
  text: string;
}

export interface StartInterviewParams {
  role: string;
  candidateName?: string;
}

export interface StartInterviewResult {
  success: boolean;
  text: string;
  questionNumber: number;
  isFinished: boolean;
  error?: string;
}

export interface RespondInterviewParams {
  role: string;
  candidateName?: string;
  history: InterviewSessionMessage[];
  userResponse: string;
  questionNumber: number;
}

export interface RespondInterviewResult {
  success: boolean;
  text: string;
  questionNumber: number;
  isFinished: boolean;
  error?: string;
}

export interface EvaluateInterviewParams {
  role: string;
  candidateName?: string;
  candidateEmail?: string;
  history: InterviewSessionMessage[];
}

export interface EvaluateInterviewResult {
  success: boolean;
  score: number;
  redFlags: number;
  summary: string;
  markdownReport: string;
  error?: string;
}

/**
 * Starts a voice interview with HERA.
 * HERA introduces herself, explains the 3-question evaluation, and asks Question 1.
 */
export async function startInterviewSession(params: StartInterviewParams): Promise<StartInterviewResult> {
  const res = await fetch('/api/interview/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error del servidor al iniciar la entrevista: ${errText}`);
  }

  return await res.json();
}

/**
 * Submits the candidate's answer for the current question.
 * HERA acknowledges the response, and asks the next question (or finishes the interview).
 */
export async function sendInterviewResponse(params: RespondInterviewParams): Promise<RespondInterviewResult> {
  const res = await fetch('/api/interview/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error del servidor al procesar la respuesta: ${errText}`);
  }

  return await res.json();
}

/**
 * Generates the formal Candidate Evaluation Report and score via Gemini backend.
 */
export async function generateEvaluationReport(params: EvaluateInterviewParams): Promise<EvaluateInterviewResult> {
  const res = await fetch('/api/interview/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error del servidor al generar la evaluación: ${errText}`);
  }

  return await res.json();
}

/**
 * Generates natural speech audio via backend Gemini TTS.
 */
export async function generateSpeechAudio(text: string): Promise<{ success: boolean; audioBase64?: string; mimeType?: string }> {
  try {
    const res = await fetch('/api/interview/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('TTS request error, will fallback to browser voice:', err);
  }
  return { success: false };
}

/**
 * Generates generic content from Gemini via secure backend proxy.
 */
export async function generateGeminiContent(prompt: string, systemInstruction?: string): Promise<string> {
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemInstruction }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  const data = await res.json();
  return data.text || '';
}

/**
 * Global audio player state to control speaking & interruptions
 */
let currentAudioContext: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;

export function stopCurrentSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
    } catch (e) {}
    currentSourceNode = null;
  }
}

/**
 * Plays base64 WAV audio through Web Audio API
 */
export async function playWavAudio(base64: string, onEnded?: () => void): Promise<() => void> {
  stopCurrentSpeech();

  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  currentAudioContext = audioCtx;

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  currentSourceNode = source;

  source.onended = () => {
    currentSourceNode = null;
    if (onEnded) onEnded();
  };

  source.start(0);

  return () => {
    try {
      source.stop();
    } catch (e) {}
    currentSourceNode = null;
  };
}

// Global cache for browser voices
let cachedBrowserVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedBrowserVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedBrowserVoices = window.speechSynthesis.getVoices();
  };
}

/**
 * Finds the best authentic American female voice in English (en-US).
 * Strictly excludes any Spanish or male voice.
 */
function findAmericanFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = cachedBrowserVoices.length > 0 ? cachedBrowserVoices : window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const isFemaleName = (name: string) => {
    const lower = name.toLowerCase();
    return lower.includes('female') || 
      lower.includes('samantha') || 
      lower.includes('victoria') || 
      lower.includes('jenny') || 
      lower.includes('zira') || 
      lower.includes('ava') || 
      lower.includes('aria') || 
      lower.includes('allison') || 
      lower.includes('karen') || 
      lower.includes('susan') || 
      lower.includes('salli') || 
      lower.includes('google us english') ||
      lower.includes('natural');
  };

  const isMaleOrNonEnglish = (name: string, lang: string) => {
    const lowerName = name.toLowerCase();
    const lowerLang = (lang || '').toLowerCase();
    if (lowerLang.startsWith('es')) return true; // Never allow Spanish
    return (lowerName.includes('male') && !lowerName.includes('female')) ||
      lowerName.includes('david') || 
      lowerName.includes('guy') || 
      lowerName.includes('george') || 
      lowerName.includes('diego') || 
      lowerName.includes('jorge') || 
      lowerName.includes('enrique');
  };

  // 1. Preferred US English Female voices
  const preferredVoice = voices.find(v => 
    (v.lang === 'en-US' || v.lang === 'en_US') && 
    isFemaleName(v.name) && 
    !isMaleOrNonEnglish(v.name, v.lang)
  );
  if (preferredVoice) return preferredVoice;

  // 2. Any en-US voice that is not male and not Spanish
  const usVoice = voices.find(v => 
    (v.lang === 'en-US' || v.lang === 'en_US') && 
    !isMaleOrNonEnglish(v.name, v.lang)
  );
  if (usVoice) return usVoice;

  // 3. Any English voice that is not male
  const enVoice = voices.find(v => 
    v.lang.startsWith('en') && 
    !isMaleOrNonEnglish(v.name, v.lang)
  );
  if (enVoice) return enVoice;

  return null;
}

/**
 * Plays speech using the browser's built-in Web Speech Synthesis with an American female voice in English
 */
export function speakWithBrowser(text: string, onEnded?: () => void): () => void {
  stopCurrentSpeech();

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEnded) onEnded();
    return () => {};
  }

  // Clean formatting characters for clear, human-like voice synthesis
  const cleanText = text
    .replace(/[*#_`~>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    if (onEnded) onEnded();
    return () => {};
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'en-US';
  utterance.rate = 0.98;
  utterance.pitch = 1.05;

  const femaleVoice = findAmericanFemaleVoice();
  if (femaleVoice) {
    utterance.voice = femaleVoice;
  } else {
    // If voices haven't loaded yet in Chrome, try once more on onvoiceschanged
    const onVoices = () => {
      cachedBrowserVoices = window.speechSynthesis.getVoices();
      const retryVoice = findAmericanFemaleVoice();
      if (retryVoice) {
        utterance.voice = retryVoice;
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoices, { once: true });
  }

  utterance.onend = () => {
    if (onEnded) onEnded();
  };

  utterance.onerror = () => {
    if (onEnded) onEnded();
  };

  window.speechSynthesis.speak(utterance);

  return () => {
    window.speechSynthesis.cancel();
  };
}

/**
 * Speaks HERA's response using high quality Gemini TTS (Aoede - American Female voice) with seamless browser fallback
 */
export async function speakHera(text: string, onEnded?: () => void): Promise<() => void> {
  stopCurrentSpeech();

  const cleanText = text
    .replace(/[*#_`~>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    if (onEnded) onEnded();
    return () => {};
  }

  // Try Gemini high-fidelity American female voice (Aoede) TTS first
  try {
    const ttsResult = await generateSpeechAudio(cleanText);
    if (ttsResult.success && ttsResult.audioBase64) {
      return await playWavAudio(ttsResult.audioBase64, onEnded);
    }
  } catch (err) {
    console.warn('Gemini TTS failed, falling back to browser synthesis:', err);
  }

  // Fallback to browser synthesis with American female voice
  return speakWithBrowser(cleanText, onEnded);
}
