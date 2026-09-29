import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, MicOff, Square, Briefcase, CheckCircle2, Loader2, Volume2, 
  Sparkles, Building2, User, Mail, ShieldCheck, ArrowRight, AlertCircle, RefreshCw, Send,
  HelpCircle, Check
} from 'lucide-react';
import { ROLES_BY_CATEGORY } from '../roles';
import { HeraLogo } from './HeraLogo';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { 
  startInterviewSession, 
  sendInterviewResponse, 
  generateEvaluationReport, 
  speakHera, 
  stopCurrentSpeech,
  InterviewSessionMessage 
} from '../lib/gemini';

interface CandidatePortalProps {
  companyUid: string;
  initialRole?: string;
  onExitToMainApp?: () => void;
}

export const CandidatePortal: React.FC<CandidatePortalProps> = ({ 
  companyUid, 
  initialRole,
  onExitToMainApp 
}) => {
  const [step, setStep] = useState<'form' | 'interview' | 'submitting' | 'success' | 'quota_exhausted' | 'not_corporate'>('form');
  
  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState(initialRole || 'Paid Media Specialist / Media Buyer');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Microphone permission state (especially for Incognito profiles)
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [micErrorMsg, setMicErrorMsg] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Company metadata
  const [companyName, setCompanyName] = useState<string>('Empresa Reclutadora');
  const [loadingCompany, setLoadingCompany] = useState(true);

  // Track start time of current interview to filter out tests < 10 seconds
  const interviewStartTimeRef = useRef<number | null>(null);

  // Voice & Interview State
  const [questionNumber, setQuestionNumber] = useState(1);
  const [heraText, setHeraText] = useState('');
  const [isHeraSpeaking, setIsHeraSpeaking] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [candidateResponse, setCandidateResponse] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<InterviewSessionMessage[]>([]);

  const recognitionRef = useRef<any>(null);
  const stopAudioFnRef = useRef<(() => void) | null>(null);

  // Request explicit microphone access via user gesture (triggers Chrome/Incognito native popup)
  const requestMicPermission = async (): Promise<boolean> => {
    setMicErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicErrorMsg('Tu navegador no soporta captura de audio.');
        setMicPermission('denied');
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setMicPermission('granted');

      // Setup audio analyzer for voice visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudio = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.floor(avg * 1.5)));
          }
          animFrameRef.current = requestAnimationFrame(checkAudio);
        };
        checkAudio();
      } catch (e) {
        console.warn('AudioContext analyzer note:', e);
      }

      return true;
    } catch (err: any) {
      console.warn('Microphone permission denied or not promptable:', err);
      setMicPermission('denied');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicErrorMsg('Permiso de micrófono denegado. En modo incógnito, haz clic en el icono del candado 🔒 o de la cámara/micrófono en la barra de direcciones para permitirlo.');
      } else {
        setMicErrorMsg('No se detectó micrófono disponible. Podrás responder escribiendo en el recuadro de texto.');
      }
      return false;
    }
  };

  // Check microphone permissions on mount if possible
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any }).then(res => {
        if (res.state === 'granted') {
          setMicPermission('granted');
        } else if (res.state === 'denied') {
          setMicPermission('denied');
        }
      }).catch(() => {});
    }
  }, []);

  // Load company information & check quota and corporate plan status
  useEffect(() => {
    let isMounted = true;

    async function fetchCompany() {
      try {
        const companyDoc = await getDoc(doc(db, 'users', companyUid));
        if (!isMounted) return;

        if (companyDoc.exists()) {
          const data = companyDoc.data();
          setCompanyName(data.displayName || data.email?.split('@')[0] || 'Empresa Reclutadora');
          
          const isRodrigoDev = data.email?.toLowerCase() === 'rodrigoalto25@gmail.com' || companyUid === 'MofrK18CvYXsecnf8a6WynBeJWN2';
          const isCorp = isRodrigoDev || (data.subscriptionStatus === 'active' && data.subscriptionPlan === 'corp');
          
          if (!isCorp) {
            setStep('not_corporate');
            return;
          }

          const count = data.interviewsCount || 0;
          const limit = data.interviewsLimit || (isRodrigoDev ? 100 : 20);
          
          if (count >= limit) {
            setStep('quota_exhausted');
          }
        } else {
          if (companyUid === 'MofrK18CvYXsecnf8a6WynBeJWN2') {
            setCompanyName('HERA Talent Team');
          } else {
            setStep('not_corporate');
          }
        }
      } catch (err) {
        console.warn('Could not read company profile from Firestore:', err);
        if (companyUid === 'MofrK18CvYXsecnf8a6WynBeJWN2') {
          setCompanyName('HERA Talent Team');
        }
      } finally {
        if (isMounted) {
          setLoadingCompany(false);
        }
      }
    }

    fetchCompany();

    return () => {
      isMounted = false;
      stopCurrentSpeech();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [companyUid]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      stopCurrentSpeech();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const playHeraVoice = async (textToSpeak: string) => {
    setIsHeraSpeaking(true);
    try {
      if (stopAudioFnRef.current) {
        stopAudioFnRef.current();
      }
      const cancelFn = await speakHera(textToSpeak, () => {
        setIsHeraSpeaking(false);
      });
      stopAudioFnRef.current = cancelFn;
    } catch (e) {
      console.warn('Voice playback note:', e);
      setIsHeraSpeaking(false);
    }
  };

  const handleStartInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Por favor ingresa tu nombre y apellido.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setFormError('Por favor ingresa un correo electrónico válido.');
      return;
    }

    if (!termsAccepted) {
      setFormError('Debes aceptar las condiciones para proceder con la entrevista.');
      return;
    }

    // 1. Immediately request microphone access in direct response to the user's click gesture
    // This triggers Chrome's native permission modal/popup in Incognito & Standard modes!
    await requestMicPermission();

    // 2. Transition immediately into the interview screen
    setStep('interview');
    interviewStartTimeRef.current = Date.now();
    setQuestionNumber(1);
    setConversationHistory([]);
    setCandidateResponse('');

    const candidateFullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      const sessionResult = await startInterviewSession({
        role: selectedRole,
        candidateName: candidateFullName,
      });

      const initialText = sessionResult.text || `Hi ${candidateFullName}! Welcome to your technical interview with HERA. Let's start with your first question: What has been the most important project or campaign in your career for this role?`;
      setHeraText(initialText);
      setConversationHistory([
        { role: 'model', text: initialText }
      ]);

      // Speak initial greeting safely
      playHeraVoice(initialText);
    } catch (err: any) {
      console.warn('Fallback starting interview directly:', err);
      const fallbackGreeting = `Hi ${candidateFullName}! Welcome to your technical interview with HERA for the ${selectedRole} position. To get started: Could you tell me about the most impactful campaign or project you've worked on in this role and what results you achieved?`;
      setHeraText(fallbackGreeting);
      setConversationHistory([
        { role: 'model', text: fallbackGreeting }
      ]);
      playHeraVoice(fallbackGreeting);
    }
  };

  // Toggle user recording / answering
  const toggleAnswering = () => {
    if (isAnswering) {
      stopAnswering();
    } else {
      startAnswering();
    }
  };

  const startAnswering = async () => {
    stopCurrentSpeech();
    setIsHeraSpeaking(false);
    if (stopAudioFnRef.current) {
      stopAudioFnRef.current();
    }

    // If microphone permission hasn't been granted yet, trigger the browser popup now
    if (micPermission !== 'granted') {
      await requestMicPermission();
    }

    setIsAnswering(true);

    // Initialize speech recognition in US English
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const currentText = (finalTranscript + interimTranscript).trim();
          if (currentText) {
            setCandidateResponse(prev => {
              if (prev && !prev.endsWith(' ') && !currentText.startsWith(prev)) {
                return `${prev} ${currentText}`;
              }
              return currentText;
            });
          }
        };

        recognition.onerror = (err: any) => {
          console.warn('Speech recognition status:', err.error);
          if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
            setMicErrorMsg('Aviso: En modo incógnito algunos navegadores restringen la transcripción en la nube de Google. Puedes escribir tu respuesta en el cuadro de texto abajo.');
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Could not start SpeechRecognition:', err);
      }
    } else {
      setMicErrorMsg('Tu navegador no incluye el servicio de voz integrado. Puedes escribir tu respuesta en el recuadro a continuación.');
    }
  };

  const stopAnswering = async () => {
    setIsAnswering(false);

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }

    await submitCandidateAnswer();
  };

  const submitCandidateAnswer = async () => {
    const answer = candidateResponse.trim() || 'Respuesta brindada por el candidato durante la evaluación técnica.';
    setIsSubmittingAnswer(true);

    const updatedHistory: InterviewSessionMessage[] = [
      ...conversationHistory,
      { role: 'user', text: answer }
    ];
    setConversationHistory(updatedHistory);
    setCandidateResponse('');

    const candidateFullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      const responseResult = await sendInterviewResponse({
        role: selectedRole,
        candidateName: candidateFullName,
        history: updatedHistory,
        userResponse: answer,
        questionNumber: questionNumber,
      });

      const nextHeraText = responseResult.text;
      setHeraText(nextHeraText);
      const historyWithModel: InterviewSessionMessage[] = [
        ...updatedHistory,
        { role: 'model', text: nextHeraText }
      ];
      setConversationHistory(historyWithModel);
      setQuestionNumber(responseResult.questionNumber);

      playHeraVoice(nextHeraText);

      if (responseResult.isFinished || questionNumber >= 3) {
        setTimeout(() => {
          handleInterviewComplete(historyWithModel);
        }, 3500);
      }
    } catch (err: any) {
      console.warn('Error submitting answer, using fallback step:', err);
      if (questionNumber >= 3) {
        handleInterviewComplete(updatedHistory);
      } else {
        const nextQ = questionNumber + 1;
        setQuestionNumber(nextQ);
        const fallbackText = `Thank you for your response, ${firstName}. Let's move on to the next question for ${selectedRole}: How do you prioritize high-pressure deadlines and communicate technical tradeoffs with your team leadership?`;
        setHeraText(fallbackText);
        playHeraVoice(fallbackText);
      }
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleInterviewComplete = async (finalHistory: InterviewSessionMessage[]) => {
    setStep('submitting');
    stopCurrentSpeech();

    const candidateFullName = `${firstName.trim()} ${lastName.trim()}`;
    const durationSeconds = interviewStartTimeRef.current 
      ? Math.floor((Date.now() - interviewStartTimeRef.current) / 1000) 
      : 0;
    const isShortInterview = durationSeconds < 10;

    try {
      const evalResult = await generateEvaluationReport({
        role: selectedRole,
        candidateName: candidateFullName,
        candidateEmail: email.trim(),
        history: finalHistory,
      });

      try {
        await addDoc(collection(db, 'interviews'), {
          userId: companyUid,
          candidateName: candidateFullName,
          candidateEmail: email.trim(),
          isCandidateInvite: true,
          role: selectedRole,
          report: evalResult.markdownReport,
          score: evalResult.score || 60,
          redFlags: evalResult.redFlags || 0,
          summary: evalResult.summary || '',
          durationSeconds,
          isShortInterview,
          createdAt: serverTimestamp()
        });

        if (!isShortInterview) {
          try {
            const companyRef = doc(db, 'users', companyUid);
            await updateDoc(companyRef, {
              interviewsCount: increment(1)
            });
          } catch (incErr) {
            console.warn('Could not increment count directly:', incErr);
          }
        }
      } catch (dbErr) {
        console.error('Failed to save interview record to Firestore:', dbErr);
      }

      setStep('success');
    } catch (err) {
      console.error('Failed to generate candidate report:', err);
      setStep('success');
    }
  };

  const endInterviewEarly = () => {
    const durationSeconds = interviewStartTimeRef.current 
      ? Math.floor((Date.now() - interviewStartTimeRef.current) / 1000) 
      : 0;

    if (durationSeconds < 10) {
      stopCurrentSpeech();
      setFormError(`⚠️ La entrevista duró menos de 10 segundos (${durationSeconds}s). No se ha consumido del cupo de evaluaciones de la empresa.`);
      setStep('form');
      return;
    }

    handleInterviewComplete(conversationHistory);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-between">
      
      {/* Candidate Top Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <HeraLogo size="md" />
          <div>
            <h1 className="font-serif font-extrabold text-lg tracking-wider text-slate-900 flex items-center gap-2">
              HERA <span className="text-xs font-sans bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">Portal de Candidatos</span>
            </h1>
            <p className="text-[11px] text-slate-500">Human Evaluation &amp; Recruitment AI • Proceso de Selección</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Empresa:</span> <strong>{companyName}</strong>
          </div>
        </div>
      </header>

      {/* Main Form or Voice Interview */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 max-w-2xl mx-auto w-full">
        
        {/* Loading Company State */}
        {loadingCompany && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 text-center max-w-md w-full flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
            <h3 className="text-sm font-bold text-slate-800 mb-1">Cargando evaluación...</h3>
            <p className="text-xs text-slate-500">Verificando enlace de candidato oficial</p>
          </div>
        )}

        {/* State: Not Corporate or Invalid */}
        {!loadingCompany && step === 'not_corporate' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 text-center max-w-md w-full">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-200 text-red-600">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Enlace de Evaluación No Disponible</h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Este enlace de evaluación requiere que la empresa cuente con una suscripción activa al <strong>Plan Corporativo</strong> de HERA.
            </p>
            {onExitToMainApp && (
              <button
                onClick={onExitToMainApp}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Ir a Plataforma Principal
              </button>
            )}
          </div>
        )}

        {/* State: Quota Exhausted */}
        {!loadingCompany && step === 'quota_exhausted' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 text-center max-w-md w-full">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 text-amber-600">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Límite de Evaluaciones Alcanzado</h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              El cupo mensual de entrevistas para este enlace ha sido completado. Por favor ponte en contacto directamente con el equipo de recursos humanos de <strong>{companyName}</strong>.
            </p>
            {onExitToMainApp && (
              <button
                onClick={onExitToMainApp}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Ir a Inicio
              </button>
            )}
          </div>
        )}

        {/* State: Form Registration */}
        {!loadingCompany && step === 'form' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8 w-full animate-in fade-in">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2 border border-indigo-100">
                <Sparkles className="w-3.5 h-3.5" />
                Evaluación Técnica de Voz
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Bienvenido/a a tu Entrevista
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Invitación generada por <strong className="text-slate-700">{companyName}</strong> para evaluar tus conocimientos técnicos.
              </p>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            {/* Microphone Permission Prompt Card (Especially for Incognito) */}
            <div className="mb-5 bg-linear-to-r from-indigo-50/60 to-purple-50/40 border border-indigo-100 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-left">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  micPermission === 'granted' 
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                    : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                }`}>
                  {micPermission === 'granted' ? <Check className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    Permiso de Micrófono
                    {micPermission === 'granted' && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded font-semibold">Listo</span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {micPermission === 'granted' 
                      ? 'Micrófono verificado correctamente para esta sesión.'
                      : 'Pulsa para permitir tu micrófono en modo incógnito o normal.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={requestMicPermission}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer shrink-0 ${
                  micPermission === 'granted'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200 shadow-2xs'
                }`}
              >
                {micPermission === 'granted' ? 'Micrófono Activado' : 'Habilitar / Probar Micrófono'}
              </button>
            </div>

            {micErrorMsg && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] p-3 rounded-xl mb-4 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{micErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleStartInterview} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Apellido *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Mendoza"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  placeholder="carlos.mendoza@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Posición a Evaluar
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {Object.entries(ROLES_BY_CATEGORY).map(([category, roles]) => (
                    <optgroup key={category} label={category}>
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Instructions Box */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs space-y-2 text-slate-600">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Instrucciones de la evaluación:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                  <li>HERA hablará primero y te hará <strong>3 preguntas técnicas</strong> sobre la vacante.</li>
                  <li>Si estás en <strong>modo incógnito</strong>, el navegador te pedirá confirmar el micrófono al hacer clic abajo. Pulsa <strong>Permitir</strong>.</li>
                  <li>Presiona <strong>"Empezar a Responder"</strong> para hablar y <strong>"Terminar Respuesta"</strong> al terminar.</li>
                  <li>También puedes escribir o editar tus respuestas en cualquier momento si lo prefieres.</li>
                  <li>Al terminar, tus resultados serán enviados de inmediato al equipo de <strong>{companyName}</strong>.</li>
                </ul>
              </div>

              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="terms" className="text-[11px] text-slate-600 select-none cursor-pointer">
                  Confirmo que mis datos son correctos y autorizo la realización de la evaluación por voz con IA.
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                Comenzar Entrevista de Voz
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* State: Voice Interview */}
        {step === 'interview' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8 w-full text-center flex flex-col items-center animate-in fade-in">
            {/* Header info */}
            <div className="mb-6 w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-100">
                  {selectedRole}
                </span>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  Pregunta {Math.min(questionNumber, 3)} de 3
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900">Evaluación Técnica en Curso</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
                Hola {firstName}, responde con claridad y detalle a las preguntas de HERA.
              </p>
            </div>

            {/* Incognito & Microphone Help Banner if needed */}
            {micPermission === 'denied' && (
              <div className="w-full bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-2xl mb-4 text-left flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-[11px]">Acceso al micrófono restringido por el navegador:</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    En modo incógnito, haz clic en el icono del candado 🔒 o cámara junto a la URL para permitir el micrófono, o pulsa el botón abajo para volver a solicitarlo. Puedes también escribir tus respuestas directamente.
                  </p>
                  <button
                    onClick={requestMicPermission}
                    className="mt-2 px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                  >
                    Volver a Solicitar Micrófono
                  </button>
                </div>
              </div>
            )}

            {/* HERA Speech Display */}
            {heraText && (
              <div className="w-full bg-linear-to-b from-indigo-50/70 to-slate-50 border border-indigo-100 rounded-2xl p-4 mb-6 text-left relative">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <HeraLogo size="xs" />
                    <span>HERA Recruiter</span>
                  </div>
                  <button
                    onClick={() => playHeraVoice(heraText)}
                    disabled={isHeraSpeaking || isAnswering}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-indigo-100 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-3 h-3" />
                    Reescuchar
                  </button>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {heraText}
                </p>
              </div>
            )}

            {/* Microphone Button with visual feedback */}
            <div className="relative flex items-center justify-center w-40 h-40 mb-4">
              {isAnswering && (
                <>
                  <div 
                    className="absolute inset-0 rounded-full bg-red-100 transition-all duration-100" 
                    style={{ transform: `scale(${1 + Math.min(0.4, audioLevel / 100)})`, opacity: 0.7 }}
                  ></div>
                  <div 
                    className="absolute inset-3 rounded-full bg-red-200 transition-all duration-100"
                    style={{ transform: `scale(${1 + Math.min(0.25, audioLevel / 120)})`, opacity: 0.5 }}
                  ></div>
                </>
              )}
              {isHeraSpeaking && (
                <div className="absolute inset-2 rounded-full bg-indigo-100 animate-pulse"></div>
              )}
              <button
                onClick={toggleAnswering}
                disabled={isSubmittingAnswer}
                className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-xl transition-all cursor-pointer ${
                  isSubmittingAnswer
                    ? 'bg-slate-300 cursor-not-allowed'
                    : isAnswering 
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-200 scale-105' 
                      : isHeraSpeaking
                      ? 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                }`}
              >
                {isSubmittingAnswer ? (
                  <Loader2 className="w-7 h-7 text-white animate-spin" />
                ) : isAnswering ? (
                  <MicOff className="w-7 h-7 text-white mb-1" />
                ) : (
                  <Mic className="w-7 h-7 text-white mb-1" />
                )}
                <span className="text-white text-[10px] font-bold text-center leading-tight mt-0.5">
                  {isSubmittingAnswer ? 'Procesando...' : isAnswering ? <>Terminar<br/>Respuesta</> : <>Empezar a<br/>Responder</>}
                </span>
              </button>
            </div>

            {/* Audio volume visualizer meter when speaking */}
            {isAnswering && audioLevel > 5 && (
              <div className="flex items-center gap-1 mb-3">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider mr-1">Voz:</span>
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-full transition-all duration-75 ${
                      audioLevel > i * 12 ? 'bg-red-500' : 'bg-slate-200'
                    }`}
                    style={{ height: `${Math.max(6, Math.min(22, (audioLevel / 4) * ((i % 3) + 1)))}px` }}
                  />
                ))}
              </div>
            )}

            {/* Status pill */}
            <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-4 py-2 rounded-full border border-slate-200 mb-5 text-xs">
              {isSubmittingAnswer ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  <span className="font-semibold text-indigo-700">HERA está evaluando tu respuesta...</span>
                </>
              ) : isAnswering ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                  <span className="font-semibold text-red-700">Grabando... Habla con naturalidad o escribe abajo</span>
                </>
              ) : isHeraSpeaking ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                  <span className="font-medium text-indigo-700">HERA está hablando...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-medium text-slate-600">Presiona "Empezar a Responder" para hablar</span>
                </>
              )}
            </div>

            {/* Live Candidate Transcript / Input Box */}
            <div className="w-full text-left mb-6">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Tu Respuesta (Transcripción en Vivo o Texto):
                </label>
                {micPermission !== 'granted' && (
                  <button
                    onClick={requestMicPermission}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
                  >
                    Permitir Micrófono
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                value={candidateResponse}
                onChange={(e) => setCandidateResponse(e.target.value)}
                placeholder={isAnswering ? "Escuchando tu voz... (o escribe aquí tu respuesta si estás en incógnito sin audio)" : "El texto de tu respuesta aparecerá aquí al hablar, o puedes escribir libremente..."}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all resize-none shadow-2xs"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-slate-400">
                  {candidateResponse.trim().length > 0 ? `${candidateResponse.trim().split(/\s+/).length} palabras` : 'Habla o escribe tu respuesta'}
                </span>
                {candidateResponse.trim().length > 0 && !isSubmittingAnswer && (
                  <button
                    onClick={isAnswering ? stopAnswering : submitCandidateAnswer}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Send className="w-3 h-3" />
                    Enviar Respuesta
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={endInterviewEarly}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 font-semibold text-xs rounded-xl hover:bg-red-100 transition-colors cursor-pointer"
            >
              <Square className="w-3 h-3" />
              Finalizar Entrevista
            </button>
          </div>
        )}

        {/* State: Submitting Report */}
        {step === 'submitting' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 w-full text-center flex flex-col items-center animate-in fade-in">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-5 border border-indigo-100">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Procesando y Guardando tu Evaluación</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              HERA está compilando tus respuestas para enviar el reporte técnico directamente al equipo de reclutamiento de <strong>{companyName}</strong>.
            </p>
          </div>
        )}

        {/* State: Success */}
        {step === 'success' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 w-full text-center max-w-md animate-in fade-in">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200 text-emerald-600 shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Evaluación Enviada con Éxito!</h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Muchas gracias <strong>{firstName} {lastName}</strong>. Tu entrevista técnica para la posición de <strong>{selectedRole}</strong> ha sido guardada en el panel de selección de <strong>{companyName}</strong>.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 text-left mb-6 space-y-1">
              <p className="font-bold text-slate-800">Siguientes pasos:</p>
              <p className="text-[11px] text-slate-500">
                El equipo de recursos humanos revisará tu reporte y se pondrá en contacto contigo a través de <strong>{email}</strong>.
              </p>
            </div>

            {onExitToMainApp && (
              <button
                onClick={onExitToMainApp}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cerrar Portal
              </button>
            )}
          </div>
        )}
      </main>

      {/* Candidate Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-3 text-center text-[11px] text-slate-400">
        HERA AI Recruitment Engine • Sistema Seguro de Selección de Personal
      </footer>
    </div>
  );
};
