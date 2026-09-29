import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Mic, MicOff, Square, Briefcase, ChevronRight, CheckCircle2, 
  Loader2, Volume2, User as UserIcon, LogOut, Zap, History, Sparkles, 
  Mail, RefreshCw, Link2, Users, Building2, AlertCircle, Send
} from 'lucide-react';
import { ROLES_BY_CATEGORY } from './roles';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { PricingModal } from './components/PricingModal';
import { InterviewHistory } from './components/InterviewHistory';
import { CompanyInviteModal } from './components/CompanyInviteModal';
import { CandidateManagementHub } from './components/CandidateManagementHub';
import { CandidatePortal } from './components/CandidatePortal';
import { HeraLogo } from './components/HeraLogo';
import { db, isUserSubscriptionActive, getExpiresAtMillis } from './lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { 
  startInterviewSession, 
  sendInterviewResponse, 
  generateEvaluationReport, 
  speakHera, 
  stopCurrentSpeech,
  InterviewSessionMessage 
} from './lib/gemini';

function MainApp() {
  const { user, profile, logout, refreshProfile, sendVerificationEmail, checkEmailVerification } = useAuth();
  
  // URL Param for Candidate Invitation Link (Synchronous initialization to prevent blank screen)
  const [candidateInviteUid, setCandidateInviteUid] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('invite');
    }
    return null;
  });
  const [candidateInviteRole, setCandidateInviteRole] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('role');
    }
    return null;
  });

  const [step, setStep] = useState<'select_role' | 'interview' | 'generating_report' | 'report'>('select_role');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [reportContent, setReportContent] = useState<string | null>(null);
  
  // Voice & Interview State
  const [questionNumber, setQuestionNumber] = useState(1);
  const [heraText, setHeraText] = useState('');
  const [isHeraSpeaking, setIsHeraSpeaking] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [candidateResponse, setCandidateResponse] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<InterviewSessionMessage[]>([]);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteRoleForModal, setInviteRoleForModal] = useState<string>('SEO Specialist');
  const [isCandidateHubOpen, setIsCandidateHubOpen] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Track start time of current interview to filter out tests < 10 seconds
  const interviewStartTimeRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const stopAudioFnRef = useRef<(() => void) | null>(null);
  const isAnsweringRef = useRef(false);

  // Check URL parameters when mounted
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteParam = urlParams.get('invite');
    const roleParam = urlParams.get('role');
    
    if (inviteParam) {
      setCandidateInviteUid(inviteParam);
      if (roleParam) setCandidateInviteRole(roleParam);
      return;
    }

    const sessionId = urlParams.get('session_id');
    const paymentSuccess = urlParams.get('payment') === 'success' || urlParams.get('payment_success') === 'true' || urlParams.get('success') === 'true';
    const planFromUrl = (urlParams.get('plan') as 'basic' | 'pro' | 'corp') || 'pro';

    if (sessionId || paymentSuccess) {
      if (!user) return; // Wait until authenticated

      setVerifyingPayment(true);
      fetch('/api/stripe/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          paymentSuccess,
          planKey: planFromUrl,
          userId: user.uid,
        }),
      })
        .then(res => res.json())
        .then(async (data) => {
          if (data.verified) {
            const planIncrements = { basic: 5, pro: 20, corp: 100 };
            const activatedPlan = (data.planKey as 'basic' | 'pro' | 'corp') || planFromUrl || 'pro';
            const quotaAdded = planIncrements[activatedPlan] || 20;
            const userRef = doc(db, 'users', user.uid);
            
            let currentLimit = 2;
            let currentExpiresMs = 0;
            let currentCount = 0;
            let existingCustomerId = '';

            try {
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                const userData = userSnap.data();
                currentLimit = userData.interviewsLimit ?? (userData.subscriptionStatus === 'active' ? 20 : 2);
                currentExpiresMs = getExpiresAtMillis(userData.subscriptionExpiresAt) || 0;
                currentCount = userData.interviewsCount || 0;
                existingCustomerId = userData.stripeCustomerId || '';
              }
            } catch (err) {
              console.warn("Could not fetch userDoc before accumulating:", err);
            }

            const newCumulativeLimit = currentLimit + quotaAdded;
            const now = Date.now();
            const baseMs = currentExpiresMs > now ? currentExpiresMs : now;
            const newExpiresAt = new Date(baseMs + 30 * 24 * 60 * 60 * 1000);

            await updateDoc(userRef, {
              subscriptionStatus: 'active',
              subscriptionPlan: activatedPlan,
              interviewsLimit: newCumulativeLimit,
              subscriptionExpiresAt: newExpiresAt,
              lastPaymentDate: serverTimestamp(),
              stripeCustomerId: data.customerId || existingCustomerId,
              updatedAt: serverTimestamp(),
            });

            await refreshProfile();
            const remaining = Math.max(0, newCumulativeLimit - currentCount);
            setPaymentNotice(`🎉 ¡Pago mensual verificado con éxito! Tu ${activatedPlan === 'basic' ? 'Plan Básico' : activatedPlan === 'corp' ? 'Plan Corporativo' : 'Plan Pro'} está activo. Se sumaron +${quotaAdded} evaluaciones acumulativas a tu cuenta (Total acumulado: ${remaining} disponibles).`);
            
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        })
        .catch(err => {
          console.error('Error verifying payment:', err);
        })
        .finally(() => {
          setVerifyingPayment(false);
        });
    }
  }, [user]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      stopCurrentSpeech();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  // If candidate is visiting via invite link, render candidate portal immediately
  if (candidateInviteUid) {
    return (
      <CandidatePortal 
        companyUid={candidateInviteUid} 
        initialRole={candidateInviteRole || undefined}
        onExitToMainApp={() => {
          window.location.href = window.location.pathname;
        }}
      />
    );
  }

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

  const startInterview = async (role: string) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    await refreshProfile();

    const isSubActive = isUserSubscriptionActive(profile);
    const hasPaidPlan = profile?.subscriptionPlan === 'basic' || profile?.subscriptionPlan === 'pro' || profile?.subscriptionPlan === 'corp';
    const isDev = profile?.email?.toLowerCase() === 'rodrigoalto25@gmail.com' || profile?.uid === 'MofrK18CvYXsecnf8a6WynBeJWN2';

    if (hasPaidPlan && !isSubActive && !isDev) {
      alert('Tu mensualidad de HERA ha vencido. Por favor renueva tu suscripción para continuar realizando evaluaciones. ¡Tus evaluaciones acumuladas están guardadas!');
      setIsPricingOpen(true);
      return;
    }

    const currentLimit = profile?.interviewsLimit ?? (isSubActive ? (profile?.subscriptionPlan === 'basic' ? 5 : profile?.subscriptionPlan === 'corp' ? 100 : 20) : 2);
    const currentCount = profile?.interviewsCount || 0;

    if (currentCount >= currentLimit) {
      setIsPricingOpen(true);
      return;
    }

    // Request microphone permission directly on user click
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (micErr) {
      console.warn('Microphone permission on click:', micErr);
    }

    setSelectedRole(role);
    setStep('interview');
    interviewStartTimeRef.current = Date.now();
    setQuestionNumber(1);
    setConversationHistory([]);
    setCandidateResponse('');

    const candidateDisp = user.displayName || user.email?.split('@')[0] || 'Candidate';
    try {
      const sessionResult = await startInterviewSession({
        role: role,
        candidateName: candidateDisp,
      });

      const initialText = sessionResult.text || `Hi ${candidateDisp}! It's great to meet you. I'm HERA, your AI Recruitment Manager. Let's begin your technical interview for the ${role} position. Could you walk me through your most impactful project or campaign in this role?`;
      setHeraText(initialText);
      setConversationHistory([
        { role: 'model', text: initialText }
      ]);

      playHeraVoice(initialText);
    } catch (err: any) {
      console.warn('Fallback starting interview:', err);
      const fallbackGreeting = `Hi ${candidateDisp}! I'm HERA, your AI Recruitment Manager. Welcome to your technical interview for the ${role} position. To get started: Could you tell me about the most impactful campaign or project you've worked on in this role and what results you achieved?`;
      setHeraText(fallbackGreeting);
      setConversationHistory([
        { role: 'model', text: fallbackGreeting }
      ]);
      playHeraVoice(fallbackGreeting);
    }
  };

  const toggleAnswering = () => {
    if (isAnswering) {
      stopAnswering();
    } else {
      startAnswering();
    }
  };

  const startAnswering = () => {
    stopCurrentSpeech();
    setIsHeraSpeaking(false);
    if (stopAudioFnRef.current) {
      stopAudioFnRef.current();
    }

    setIsAnswering(true);
    isAnsweringRef.current = true;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
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
          console.warn('Speech recognition warning:', err.error);
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Could not start SpeechRecognition:', err);
      }
    }
  };

  const stopAnswering = async () => {
    setIsAnswering(false);
    isAnsweringRef.current = false;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }

    await submitCandidateAnswer();
  };

  const submitCandidateAnswer = async () => {
    const answer = candidateResponse.trim() || 'Respuesta grabada durante la evaluación.';
    setIsSubmittingAnswer(true);

    const updatedHistory: InterviewSessionMessage[] = [
      ...conversationHistory,
      { role: 'user', text: answer }
    ];
    setConversationHistory(updatedHistory);
    setCandidateResponse('');

    const candidateDisp = user?.displayName || user?.email?.split('@')[0] || 'Candidato';

    try {
      const responseResult = await sendInterviewResponse({
        role: selectedRole,
        candidateName: candidateDisp,
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

      await playHeraVoice(nextHeraText);

      if (responseResult.isFinished || questionNumber >= 3) {
        setTimeout(() => {
          handleInterviewComplete(historyWithModel);
        }, 3500);
      }
    } catch (err: any) {
      console.error('Error submitting answer:', err);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleInterviewComplete = async (finalHistory: InterviewSessionMessage[]) => {
    setStep('generating_report');
    stopCurrentSpeech();

    const durationSeconds = interviewStartTimeRef.current 
      ? Math.floor((Date.now() - interviewStartTimeRef.current) / 1000) 
      : 0;
    const isShortInterview = durationSeconds < 10;
    
    try {
      const candidateDisp = user?.displayName || user?.email?.split('@')[0] || 'Candidato';
      const evalResult = await generateEvaluationReport({
        role: selectedRole,
        candidateName: candidateDisp,
        candidateEmail: user?.email || '',
        history: finalHistory,
      });

      const markdownReport = evalResult.markdownReport || 'Reporte completado.';
      setReportContent(markdownReport);
      setStep('report');

      if (user) {
        try {
          await addDoc(collection(db, 'interviews'), {
            userId: user.uid,
            role: selectedRole,
            report: markdownReport,
            score: evalResult.score || 0,
            redFlags: evalResult.redFlags || 0,
            summary: evalResult.summary || '',
            durationSeconds,
            isShortInterview,
            createdAt: serverTimestamp()
          });

          if (!isShortInterview) {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              interviewsCount: increment(1)
            });
            await refreshProfile();
          } else {
            setPaymentNotice(`ℹ️ La entrevista duró ${durationSeconds} segundos (< 10s). No se ha descontado de tu límite de evaluaciones.`);
          }
        } catch (dbErr) {
          console.error('Failed to save interview record to Firestore:', dbErr);
        }
      }

    } catch (err) {
      console.error('Failed to generate report:', err);
      setReportContent('No se pudo generar el reporte completo. Por favor intenta de nuevo.');
      setStep('report');
    }
  };

  const endInterviewEarly = () => {
    const durationSeconds = interviewStartTimeRef.current 
      ? Math.floor((Date.now() - interviewStartTimeRef.current) / 1000) 
      : 0;

    if (durationSeconds < 10) {
      stopCurrentSpeech();
      setPaymentNotice(`⚠️ La entrevista duró menos de 10 segundos (${durationSeconds}s). No se ha descontado de tu límite de evaluaciones.`);
      setStep('select_role');
      return;
    }

    handleInterviewComplete(conversationHistory);
  };

  const isPro = profile?.subscriptionStatus === 'active';
  const userLimit = profile?.interviewsLimit ?? (isPro ? (profile?.subscriptionPlan === 'basic' ? 5 : profile?.subscriptionPlan === 'corp' ? 100 : 20) : 2);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Payment Verification Banner */}
      {verifyingPayment && (
        <div className="bg-indigo-600 text-white text-xs font-semibold py-2.5 px-4 text-center flex items-center justify-center gap-2 shadow-sm shrink-0">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Verificando tu transacción de pago con Stripe, un momento...</span>
        </div>
      )}
      {paymentNotice && (
        <div className="bg-emerald-600 text-white text-xs font-semibold py-2.5 px-4 text-center flex items-center justify-center gap-2 relative shadow-sm shrink-0">
          <span>{paymentNotice}</span>
          <button onClick={() => setPaymentNotice(null)} className="ml-3 underline hover:text-emerald-100 font-bold cursor-pointer">
            Entendido
          </button>
        </div>
      )}

      {/* Unverified Email Warning Banner */}
      {user && !user.emailVerified && user.providerData?.[0]?.providerId === 'password' && (
        <div className="bg-amber-500 text-white text-xs font-medium py-2 px-4 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <Mail className="w-4 h-4 shrink-0 hidden sm:block" />
            <span>
              Verifica tu correo electrónico (<strong>{user.email}</strong>) para validar tu cuenta.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {emailNotice && <span className="text-[11px] text-amber-100 font-semibold">{emailNotice}</span>}
            <button
              onClick={async () => {
                try {
                  await sendVerificationEmail();
                  setEmailNotice('¡Enlace reenviado!');
                  setTimeout(() => setEmailNotice(null), 4000);
                } catch (e) {
                  setEmailNotice('Error al enviar');
                }
              }}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 rounded-lg text-white font-semibold text-[11px] transition-colors cursor-pointer"
            >
              Reenviar correo
            </button>
            <button
              onClick={async () => {
                setCheckingEmail(true);
                const verified = await checkEmailVerification();
                setCheckingEmail(false);
                if (verified) {
                  alert('¡Correo verificado con éxito!');
                } else {
                  alert('Aún no hemos detectado la confirmación en el enlace. Revisa tu correo y vuelve a pulsar este botón.');
                }
              }}
              disabled={checkingEmail}
              className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-900 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              {checkingEmail && <RefreshCw className="w-3 h-3 animate-spin" />}
              Ya lo verifiqué
            </button>
          </div>
        </div>
      )}

      {/* Monthly Subscription Expired Alert Banner */}
      {profile?.subscriptionPlan && !isUserSubscriptionActive(profile) && profile?.email?.toLowerCase() !== 'rodrigoalto25@gmail.com' && (
        <div className="bg-rose-700 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-xs sticky top-0 z-30">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              Tu mensualidad del {profile.subscriptionPlan === 'basic' ? 'Plan Básico' : profile.subscriptionPlan === 'corp' ? 'Plan Corporativo' : 'Plan Pro'} ha vencido. Tus evaluaciones acumuladas ({profile.interviewsCount || 0}/{userLimit}) están seguras. Renueva tu pago mensual para reactivar el servicio.
            </span>
          </div>
          <button
            onClick={() => setIsPricingOpen(true)}
            className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-900 font-bold text-xs rounded-lg transition-colors shrink-0 ml-3 cursor-pointer"
          >
            Renovar Mensualidad ($14.99 USD)
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <HeraLogo size="md" />
          <div>
            <h1 className="font-serif font-extrabold text-xl tracking-wider text-slate-900 leading-tight">
              HERA
            </h1>
            <p className="text-[10px] uppercase font-semibold tracking-widest text-slate-400 hidden sm:block">
              Human Evaluation &amp; Recruitment AI
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Subscription Status Pill */}
          {(() => {
            const isSubActive = isUserSubscriptionActive(profile);
            const isExpired = profile?.subscriptionPlan && !isSubActive && profile?.email?.toLowerCase() !== 'rodrigoalto25@gmail.com';
            
            return (
              <button
                onClick={() => setIsPricingOpen(true)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                  isExpired
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : isSubActive 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">
                  {isExpired ? (
                    `Mensualidad Vencida - Renovar (${profile?.interviewsCount || 0}/${userLimit})`
                  ) : isSubActive ? (
                    `${profile?.subscriptionPlan === 'basic' ? 'Plan Básico' : profile?.subscriptionPlan === 'corp' ? 'Plan Corporativo' : 'Plan Pro'} (${profile?.interviewsCount || 0}/${userLimit})`
                  ) : user ? (
                    `Prueba Gratis (${profile?.interviewsCount || 0}/${userLimit})`
                  ) : (
                    'Planes & Precios'
                  )}
                </span>
                <span className="md:hidden">
                  {isExpired ? 'Renovar' : isSubActive ? `${profile?.interviewsCount || 0}/${userLimit}` : 'Planes'}
                </span>
              </button>
            );
          })()}

          {/* User Auth Section */}
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Recruiter / ATS Candidate Hub - Corporate Plan Exclusive */}
              {profile?.subscriptionStatus === 'active' && profile?.subscriptionPlan === 'corp' && (
                <>
                  <button
                    onClick={() => setIsCandidateHubOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    title="Panel de Candidatos & ATS"
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Panel Candidatos</span>
                  </button>

                  <button
                    onClick={() => {
                      setInviteRoleForModal('SEO Specialist');
                      setIsInviteModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    title="Generar Enlace para Candidatos"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Invitar</span>
                  </button>
                </>
              )}

              <button
                onClick={() => setIsHistoryOpen(true)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                title="Historial de Entrevistas"
              >
                <History className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    (user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()
                  )}
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <UserIcon className="w-4 h-4" />
              Iniciar Sesión
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col w-full mx-auto p-4 md:p-6 overflow-hidden">
        
        {/* Step 1: Role Selection */}
        {step === 'select_role' && (
          <div className="flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto w-full py-4 overflow-y-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2 border border-indigo-100">
                <Sparkles className="w-3.5 h-3.5" />
                Plataforma de Entrevistas de Voz con IA
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
                Practica tus entrevistas con HERA
              </h2>
              <p className="text-sm md:text-base text-slate-600 max-w-xl mx-auto">
                Selecciona el puesto, realiza la entrevista de voz y recibe un reporte detallado con feedback, puntaje técnico y red flags detectadas.
              </p>
            </div>

            {/* Corporate Plan Active Banner (Only visible when user has an active Corporate Plan) */}
            {profile?.subscriptionStatus === 'active' && profile?.subscriptionPlan === 'corp' && (
              <div className="w-full bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 md:p-6 mb-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-800 animate-in fade-in">
                <div className="flex items-center gap-4 text-center md:text-left">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mx-auto md:mx-0">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm md:text-base flex items-center justify-center md:justify-start gap-2">
                      Plan Corporativo Activo
                      <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40">
                        Empresa
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Genera enlaces únicos para tus candidatos o revisa sus respuestas y reportes en el panel ATS.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => {
                      setInviteRoleForModal('SEO Specialist');
                      setIsInviteModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Link2 className="w-4 h-4" />
                    Generar Enlace
                  </button>
                  <button
                    onClick={() => setIsCandidateHubOpen(true)}
                    className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-4 h-4" />
                    Ver ATS
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 w-full max-h-[58vh] overflow-y-auto">
              <h3 className="font-bold text-slate-900 mb-6 flex items-center justify-between sticky top-0 bg-white z-10 pb-3 border-b border-slate-100">
                <span className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-indigo-600" />
                  Catálogo de Puestos Disponibles
                </span>
                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                  30+ Roles
                </span>
              </h3>
              <div className="space-y-8">
                {Object.entries(ROLES_BY_CATEGORY).map(([category, roles]) => (
                  <div key={category}>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{category}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {roles.map(role => (
                        <div
                          key={role}
                          className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 transition-all group shadow-2xs bg-white"
                        >
                          <button
                            onClick={() => startInterview(role)}
                            className="flex-1 text-left flex items-center justify-between cursor-pointer"
                          >
                            <span className="font-semibold text-xs text-slate-800 group-hover:text-indigo-700">{role}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5" />
                          </button>
                          
                          {/* Corporate only: Quick Invite Button */}
                          {profile?.subscriptionStatus === 'active' && profile?.subscriptionPlan === 'corp' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInviteRoleForModal(role);
                                setIsInviteModalOpen(true);
                              }}
                              className="ml-2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/60 rounded-xl transition-colors shrink-0 cursor-pointer"
                              title={`Generar enlace de invitación para ${role}`}
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Voice Interview */}
        {step === 'interview' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden max-w-4xl mx-auto w-full p-6 md:p-8 animate-in fade-in">
            {/* Top meta */}
            <div className="w-full flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-100">
                Puesto: {selectedRole}
              </span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                Pregunta {Math.min(questionNumber, 3)} de 3
              </span>
            </div>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Entrevista de Voz con HERA</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Escucha la pregunta de HERA, luego presiona <strong>"Empezar a Responder"</strong> para hablar.
                Al finalizar, presiona <strong>"Terminar Respuesta"</strong>.
              </p>
            </div>

            {/* HERA Speech Display */}
            {heraText && (
              <div className="w-full bg-linear-to-b from-indigo-50/70 to-slate-50 border border-indigo-100 rounded-2xl p-4 mb-6 text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <HeraLogo size="xs" />
                    <span>HERA Recruiter</span>
                  </div>
                  <button
                    onClick={() => playHeraVoice(heraText)}
                    disabled={isHeraSpeaking || isAnswering}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-indigo-100 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-3 h-3" />
                    Reescuchar Pregunta
                  </button>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {heraText}
                </p>
              </div>
            )}

            {/* Microphone Button */}
            <div className="relative flex items-center justify-center w-40 h-40 mb-6">
              {isAnswering && (
                <>
                  <div className="absolute inset-0 rounded-full bg-red-100 animate-ping opacity-75" style={{ animationDuration: '2s' }}></div>
                  <div className="absolute inset-4 rounded-full bg-red-200 animate-ping opacity-50" style={{ animationDuration: '1.5s' }}></div>
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
                  {isSubmittingAnswer ? 'Evaluando...' : isAnswering ? <>Terminar<br/>Respuesta</> : <>Empezar a<br/>Responder</>}
                </span>
              </button>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-5 py-2 rounded-full border border-slate-200 mb-5 text-xs">
              {isSubmittingAnswer ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  <span className="font-semibold text-indigo-700">HERA está evaluando tu respuesta...</span>
                </>
              ) : isAnswering ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                  <span className="font-semibold text-red-700">Grabando tu respuesta... Habla con claridad</span>
                </>
              ) : isHeraSpeaking ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                  <span className="font-medium text-indigo-700">HERA está hablando...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-medium">Presiona "Empezar a Responder" para hablar</span>
                </>
              )}
            </div>

            {/* Live Candidate Transcript / Input Box */}
            <div className="w-full text-left mb-6">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Tu Respuesta (Transcripción en Vivo):
              </label>
              <textarea
                rows={2}
                value={candidateResponse}
                onChange={(e) => setCandidateResponse(e.target.value)}
                placeholder={isAnswering ? "Escuchando tu voz..." : "El texto de tu respuesta aparecerá aquí al hablar, o puedes escribir si lo prefieres..."}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all resize-none"
              />
              {!isAnswering && candidateResponse.trim().length > 0 && !isSubmittingAnswer && (
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={submitCandidateAnswer}
                    className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Send className="w-3 h-3" />
                    Enviar Respuesta
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={endInterviewEarly}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-semibold text-xs rounded-xl hover:bg-red-100 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              Finalizar Entrevista
            </button>
          </div>
        )}

        {/* Step 3: Generating Report */}
        {step === 'generating_report' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl shadow-sm border border-slate-200 max-w-4xl mx-auto w-full p-8 animate-in fade-in">
            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 border border-indigo-100 shadow-inner">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Generando Reporte de Evaluación</h2>
            <p className="text-xs text-slate-500 text-center max-w-md">
              HERA está analizando las respuestas, asignando puntaje técnico y guardando la evaluación en la base de datos de tu cuenta.
            </p>
          </div>
        )}

        {/* Step 4: Report View */}
        {step === 'report' && (
          <div className="flex-1 flex flex-col items-center justify-center py-6 w-full overflow-y-auto animate-in fade-in">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 w-full max-w-3xl overflow-hidden">
              <div className="bg-indigo-600 px-6 py-8 text-white text-center">
                <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-1">Entrevista Finalizada</h2>
                <p className="text-indigo-100 text-xs">HERA ha generado el reporte ejecutivo para esta vacante.</p>
              </div>
              
              <div className="p-6 md:p-8">
                <div className="prose prose-slate max-w-none text-xs">
                  <ReactMarkdown>{reportContent || "No se generó reporte."}</ReactMarkdown>
                </div>
                
                <div className="mt-8 flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setStep('select_role');
                      setReportContent(null);
                      setSelectedRole('');
                    }}
                    className="px-6 py-2.5 bg-slate-900 text-white font-medium text-xs rounded-xl hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
                  >
                    Evaluar Otro Puesto
                  </button>
                  {user && (
                    <button
                      onClick={() => setIsHistoryOpen(true)}
                      className="px-6 py-2.5 bg-slate-100 text-slate-700 font-medium text-xs rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Ver Historial
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* SaaS & ATS Modals */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <PricingModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} />
      <InterviewHistory isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <CompanyInviteModal 
        isOpen={isInviteModalOpen} 
        onClose={() => setIsInviteModalOpen(false)} 
        defaultRole={inviteRoleForModal} 
      />
      <CandidateManagementHub 
        isOpen={isCandidateHubOpen} 
        onClose={() => setIsCandidateHubOpen(false)} 
        onOpenInviteModal={() => {
          setIsCandidateHubOpen(false);
          setIsInviteModalOpen(true);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
