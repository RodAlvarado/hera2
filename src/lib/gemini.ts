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
 * Ensures browser speech synthesis voices are populated.
 */
export function ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    cachedBrowserVoices = voices;
    return Promise.resolve(voices);
  }
  return new Promise((resolve) => {
    let resolved = false;
    const handleVoices = () => {
      if (resolved) return;
      resolved = true;
      cachedBrowserVoices = window.speechSynthesis.getVoices();
      resolve(cachedBrowserVoices);
    };
    window.speechSynthesis.addEventListener('voiceschanged', handleVoices, { once: true });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cachedBrowserVoices = window.speechSynthesis.getVoices();
        resolve(cachedBrowserVoices);
      }
    }, 150);
  });
}

/**
 * Finds the highest quality authentic American female voice in English (en-US).
 * Strictly excludes any Spanish, male, or robotic non-English voices.
 */
function findAmericanFemaleVoice(availableVoices?: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = (availableVoices && availableVoices.length > 0)
    ? availableVoices
    : (cachedBrowserVoices.length > 0 ? cachedBrowserVoices : window.speechSynthesis.getVoices());
  
  if (!voices || voices.length === 0) return null;

  const isExcluded = (v: SpeechSynthesisVoice) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    // Strictly block Spanish
    if (lang.startsWith('es') || lang.includes('es-') || lang.includes('es_')) return true;
    if (name.includes('spanish') || name.includes('español')) return true;
    // Strictly block male voices
    if (name.includes('male') && !name.includes('female')) return true;
    if (
      name.includes('david') || 
      name.includes('guy') || 
      name.includes('george') || 
      name.includes('diego') || 
      name.includes('jorge') || 
      name.includes('enrique') ||
      name.includes('mark') ||
      name.includes('stefan') ||
      name.includes('daniel')
    ) return true;
    return false;
  };

  // High priority list of top American female voices
  const PRIORITY_FEMALE_VOICES = [
    'microsoft jenny',
    'microsoft aria',
    'microsoft michelle',
    'microsoft ana',
    'google us english',
    'samantha',
    'victoria',
    'allison',
    'ava',
    'microsoft zira',
    'salli',
    'joanna',
    'kendra',
    'kimberly',
    'karen',
    'susan'
  ];

  // 1. Highest priority: Well-known natural American female voices in en-US
  for (const targetName of PRIORITY_FEMALE_VOICES) {
    const matched = voices.find(v => {
      const vLang = (v.lang || '').toLowerCase();
      const vName = (v.name || '').toLowerCase();
      return (vLang === 'en-us' || vLang === 'en_us') && vName.includes(targetName) && !isExcluded(v);
    });
    if (matched) return matched;
  }

  // 2. Any en-US voice that identifies as female or natural
  const anyFemaleUs = voices.find(v => {
    const vLang = (v.lang || '').toLowerCase();
    const vName = (v.name || '').toLowerCase();
    const hasFemaleMarker = vName.includes('female') || vName.includes('natural') || vName.includes('neural');
    return (vLang === 'en-us' || vLang === 'en_us') && hasFemaleMarker && !isExcluded(v);
  });
  if (anyFemaleUs) return anyFemaleUs;

  // 3. Any en-US voice that is not excluded (fallback en-US)
  const anyUs = voices.find(v => {
    const vLang = (v.lang || '').toLowerCase();
    return (vLang === 'en-us' || vLang === 'en_us') && !isExcluded(v);
  });
  if (anyUs) return anyUs;

  // 4. Any English voice that is female
  const anyEnglishFemale = voices.find(v => {
    const vLang = (v.lang || '').toLowerCase();
    const vName = (v.name || '').toLowerCase();
    return vLang.startsWith('en') && (vName.includes('female') || vName.includes('samantha')) && !isExcluded(v);
  });
  if (anyEnglishFemale) return anyEnglishFemale;

  return null;
}

/**
 * Plays speech using the browser's built-in Web Speech Synthesis with an authentic American female voice in English (en-US).
 * Strictly forces en-US language, calibrated natural cadence, and avoids robotic distortions.
 */
export function speakWithBrowser(text: string, onEnded?: () => void): () => void {
  stopCurrentSpeech();

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEnded) onEnded();
    return () => {};
  }

  // Clean formatting characters for clear, human-like voice synthesis
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*#_`~>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    if (onEnded) onEnded();
    return () => {};
  }

  let cancelled = false;
  const utterance = new SpeechSynthesisUtterance(cleanText);

  // Force language setting to English (en-US) explicitly
  utterance.lang = 'en-US';
  utterance.rate = 0.96;   // Natural, conversational pacing
  utterance.pitch = 1.02;  // Articulate, warm female tone
  utterance.volume = 1.0;

  const assignVoiceAndSpeak = (voices: SpeechSynthesisVoice[]) => {
    if (cancelled) return;

    const femaleVoice = findAmericanFemaleVoice(voices);
    if (femaleVoice) {
      utterance.voice = femaleVoice;
      utterance.lang = femaleVoice.lang || 'en-US';
    } else {
      utterance.lang = 'en-US';
    }

    utterance.onend = () => {
      if (onEnded) onEnded();
    };

    utterance.onerror = (e) => {
      console.warn('Browser speech synthesis error:', e);
      if (onEnded) onEnded();
    };

    window.speechSynthesis.speak(utterance);
  };

  const currentVoices = cachedBrowserVoices.length > 0 ? cachedBrowserVoices : window.speechSynthesis.getVoices();
  if (currentVoices.length > 0) {
    cachedBrowserVoices = currentVoices;
    assignVoiceAndSpeak(currentVoices);
  } else {
    ensureVoicesLoaded().then(voices => {
      assignVoiceAndSpeak(voices);
    });
  }

  return () => {
    cancelled = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };
}

/**
 * Speaks HERA's response using a high-quality American female voice and forces English (en-US) language.
 * Prioritizes Gemini High-Fidelity Studio Speech (Aoede voice) with seamless browser fallback.
 */
export async function speakHera(text: string, onEnded?: () => void): Promise<() => void> {
  stopCurrentSpeech();

  // Clean formatting and markdown to ensure natural phonetics and conversational delivery
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*#_`~>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    if (onEnded) onEnded();
    return () => {};
  }

  // Pre-load browser voices in the background to ensure instantaneous fallback if needed
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    ensureVoicesLoaded();
  }

  // 1. Try Gemini Studio TTS (Aoede - Natural American Female Voice in English)
  try {
    const ttsResult = await generateSpeechAudio(cleanText);
    if (ttsResult.success && ttsResult.audioBase64) {
      return await playWavAudio(ttsResult.audioBase64, onEnded);
    }
  } catch (err) {
    console.warn('Gemini TTS failed, falling back to browser American female voice:', err);
  }

  // 2. Seamless Fallback: Browser Web Speech explicitly forced to English (en-US) and American female voice
  return speakWithBrowser(cleanText, onEnded);
}
