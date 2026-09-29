import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Check, Zap, CreditCard, Shield, X, AlertCircle, Building2, User, Sparkles, UserMinus, Calendar, RefreshCw } from 'lucide-react';
import { db, isUserSubscriptionActive, getExpiresAtMillis } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/stripe/config')
        .then(res => res.json())
        .then(data => setStripeConfigured(data.isConfigured))
        .catch(() => setStripeConfigured(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPlan = profile?.subscriptionPlan;
  const isSubscribed = isUserSubscriptionActive(profile);
  const isPastDue = profile?.subscriptionStatus === 'past_due' || (!isSubscribed && !!profile?.subscriptionPlan);
  const currentLimit = profile?.interviewsLimit ?? (isSubscribed ? (currentPlan === 'basic' ? 5 : currentPlan === 'corp' ? 100 : 20) : 2);
  const interviewsUsed = profile?.interviewsCount || 0;
  const interviewsRemaining = Math.max(0, currentLimit - interviewsUsed);
  const isLimitReached = interviewsUsed >= currentLimit;

  // Format expiration or next billing date
  const expiresMs = getExpiresAtMillis(profile?.subscriptionExpiresAt);
  const billingDateStr = expiresMs ? new Date(expiresMs).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : null;

  const STRIPE_PAYMENT_LINKS = {
    basic: 'https://buy.stripe.com/bJe14p5067rd9qDf6r2cg01',
    pro: 'https://buy.stripe.com/28EfZjfEK5j5byLaQb2cg04',
    corp: 'https://buy.stripe.com/cNi9AVeAGaDp1Yb8I32cg03',
  };

  const handleSubscribe = async (planKey: 'basic' | 'pro' | 'corp') => {
    if (!user) {
      alert('Por favor inicia sesión antes de suscribirte.');
      return;
    }

    setLoadingPlan(planKey);
    setNotice(null);

    // Direct Stripe Payment Link with user metadata appended
    const baseUrl = STRIPE_PAYMENT_LINKS[planKey];
    const targetUrl = new URL(baseUrl);
    targetUrl.searchParams.set('client_reference_id', user.uid);
    if (user.email) {
      targetUrl.searchParams.set('prefilled_email', user.email);
    }

    window.location.href = targetUrl.toString();
  };

  const handleUnsubscribe = async () => {
    if (!user) return;
    const confirmCancel = window.confirm(
      '¿Estás seguro de que deseas desuscribirte? Tu plan se cancelará y tu cuenta volverá al plan gratuito con 2 evaluaciones.'
    );
    if (!confirmCancel) return;

    setCancelingSubscription(true);
    setNotice(null);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        subscriptionStatus: 'free_trial',
        subscriptionPlan: null,
        interviewsLimit: 2,
        updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      setNotice('Tu suscripción ha sido cancelada exitosamente. Tu cuenta ahora se encuentra en la versión gratuita.');
    } catch (err: any) {
      console.error('Error al desuscribir:', err);
      alert('Hubo un error al procesar la desuscripción. Por favor inténtalo de nuevo.');
    } finally {
      setCancelingSubscription(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!profile?.stripeCustomerId) {
      alert('No se encontró un ID de cliente de Stripe asociado.');
      return;
    }

    setLoadingPlan('manage');
    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: profile.stripeCustomerId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Error opening Stripe portal:', err);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-5xl my-8 overflow-hidden relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Banner */}
        <div className="bg-slate-900 p-6 md:p-8 text-white text-center relative shrink-0 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3 border border-indigo-500/30">
            <Zap className="w-3.5 h-3.5" />
            Planes de Suscripción HERA SaaS
          </div>
          <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight">Elige el plan ideal para tu equipo</h3>
          <p className="text-slate-400 text-xs md:text-sm mt-1 max-w-lg mx-auto">
            Escala tu proceso de reclutamiento con evaluaciones automáticas por voz potenciadas por Inteligencia Artificial.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 overflow-y-auto flex-1">
          {notice ? (
            <div className="mb-6 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Suscripción Actualizada</p>
                <p>{notice}</p>
              </div>
            </div>
          ) : isPastDue ? (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-0.5 text-sm">Tu mensualidad de HERA ha vencido</p>
                  <p className="text-rose-700">
                    Para seguir usando la plataforma y mantener activas tus evaluaciones acumuladas ({interviewsUsed}/{currentLimit}), valida y renueva tu pago mensual. ¡Tus evaluaciones acumuladas no se pierden y se mantendrán disponibles!
                  </p>
                  {billingDateStr && (
                    <p className="text-[11px] text-rose-500 mt-1">
                      Ciclo anterior vencido el: {billingDateStr}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleSubscribe(currentPlan || 'pro')}
                disabled={loadingPlan !== null}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs shrink-0 cursor-pointer transition-all"
              >
                {loadingPlan ? 'Redirigiendo...' : 'Renovar Mensualidad'}
              </button>
            </div>
          ) : isLimitReached ? (
            <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Límite de Evaluaciones Alcanzado ({interviewsUsed}/{currentLimit})</p>
                <p>Has alcanzado el límite de evaluaciones acumuladas de tu plan. Suscríbete o renueva para añadir nuevas evaluaciones a tu cuenta acumulativa.</p>
              </div>
            </div>
          ) : null}

          {/* Active Subscription Banner with Unsubscribe button on right */}
          {isSubscribed && (
            <div className="mb-6 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-900">
                      Suscripción Activa: {currentPlan === 'basic' ? 'Plan Básico' : currentPlan === 'corp' ? 'Plan Corporativo' : 'Plan Pro'}
                    </p>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Activo & Validado
                    </span>
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Acumulativo
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Tienes <strong>{interviewsRemaining}</strong> evaluaciones disponibles para usar ({interviewsUsed} utilizadas de {currentLimit} acumuladas).
                    {billingDateStr ? ` • Próxima renovación mensual: ${billingDateStr}.` : ''}
                  </p>
                  <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                    ✨ Tus evaluaciones no utilizadas no se reinician; se acumulan mes a mes.
                  </p>
                </div>
              </div>

              {/* Botón de Desuscripción en el lado derecho */}
              <button
                onClick={handleUnsubscribe}
                disabled={cancelingSubscription}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
              >
                <UserMinus className="w-3.5 h-3.5" />
                {cancelingSubscription ? 'Cancelando...' : 'Desuscribirme'}
              </button>
            </div>
          )}

          {/* 3 Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            
            {/* PLAN BÁSICO */}
            <div className={`rounded-2xl border p-6 flex flex-col justify-between transition-all relative ${
              currentPlan === 'basic' && isSubscribed
                ? 'border-emerald-500 bg-emerald-50/20 shadow-md'
                : 'border-slate-200 hover:border-slate-300 bg-white shadow-2xs'
            }`}>
              {currentPlan === 'basic' && isSubscribed && (
                <div className="absolute -top-3 right-4 bg-emerald-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                  Tu Plan Actual
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 text-slate-700 font-bold text-base mb-1">
                  <User className="w-4 h-4 text-slate-500" />
                  Plan Básico
                </div>
                <p className="text-[11px] text-slate-500 mb-4">Ideal para pequeños reclutadores o si estás buscando trabajo en empresas americanas de forma sencilla.</p>

                <div className="flex items-baseline gap-1 mb-4 pb-4 border-b border-slate-100">
                  <span className="text-3xl font-extrabold text-slate-900">$9.99</span>
                  <span className="text-slate-500 text-xs font-medium">USD / mes</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 text-center mb-5 border border-slate-100">
                  <span className="text-xs font-bold text-slate-800">+5 entrevistas acumulativas / mes</span>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span><strong>5 Evaluaciones de Voz / mes</strong> (Acumulativas)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Saldo acumulativo: no se pierde a fin de mes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Catálogo de 30+ roles técnicos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Reportes con Score y Red Flags</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Historial en la nube</span>
                  </li>
                </ul>
              </div>

              {currentPlan === 'basic' && isSubscribed ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 py-2.5 px-3 bg-emerald-100/60 text-emerald-800 font-semibold text-xs rounded-xl text-center border border-emerald-200">
                    Plan Activo
                  </div>
                  <button
                    onClick={handleUnsubscribe}
                    disabled={cancelingSubscription}
                    className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs rounded-xl border border-red-200 transition-all cursor-pointer"
                  >
                    Desuscribir
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleSubscribe('basic')}
                  disabled={loadingPlan !== null || cancelingSubscription}
                  className="w-full py-2.5 px-4 font-semibold text-xs rounded-xl transition-all shadow-xs bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                >
                  {loadingPlan === 'basic' ? 'Procesando...' : isPastDue && currentPlan === 'basic' ? 'Reactivar Mensualidad ($9.99)' : 'Seleccionar Plan Básico'}
                </button>
              )}
            </div>

            {/* PLAN PRO (DESTACADO) */}
            <div className={`rounded-2xl border-2 p-6 flex flex-col justify-between transition-all relative shadow-lg ${
              currentPlan === 'pro' && isSubscribed
                ? 'border-emerald-500 bg-emerald-50/30'
                : 'border-indigo-600 bg-gradient-to-b from-indigo-50/40 via-white to-white'
            }`}>
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-extrabold px-3.5 py-1 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {currentPlan === 'pro' && isSubscribed ? 'Tu Plan Actual' : 'Más Popular'}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-base">
                    <Zap className="w-4 h-4 text-indigo-600" />
                    Plan Pro
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Acumulativo
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">Para consultores de RRHH o si estás postulando de forma constante a entrevistas para encontrar trabajos remotos en USA.</p>

                <div className="flex items-baseline gap-1 mb-4 pb-4 border-b border-indigo-100">
                  <span className="text-4xl font-extrabold text-slate-900">$14.99</span>
                  <span className="text-slate-500 text-xs font-medium">USD / mes</span>
                </div>

                <div className="bg-indigo-100/60 rounded-xl p-3 text-center mb-5 border border-indigo-200/60">
                  <span className="text-xs font-extrabold text-indigo-900">+20 entrevistas acumulativas mensuales</span>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-700 mb-6">
                  <li className="flex items-center gap-2 font-medium">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span><strong>20 Evaluaciones de Voz / mes</strong></span>
                  </li>
                  <li className="flex items-center gap-2 font-semibold text-emerald-700">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>100% Acumulativas:</strong> no caducan ni se reinician</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Validación mensual de suscripción vía Stripe</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Catálogo completo con 30+ roles</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Reportes ejecutivos con Score y Red Flags</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Historial de candidatos ilimitado</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Soporte prioritario por email</span>
                  </li>
                </ul>
              </div>

              {currentPlan === 'pro' && isSubscribed ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 py-3 px-3 bg-emerald-100/60 text-emerald-800 font-bold text-xs rounded-xl text-center border border-emerald-200">
                    Plan Activo
                  </div>
                  <button
                    onClick={handleUnsubscribe}
                    disabled={cancelingSubscription}
                    className="py-3 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-all cursor-pointer"
                  >
                    Desuscribir
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleSubscribe('pro')}
                  disabled={loadingPlan !== null || cancelingSubscription}
                  className="w-full py-3 px-4 font-bold text-xs rounded-xl transition-all shadow-md bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 cursor-pointer"
                >
                  {loadingPlan === 'pro' ? 'Procesando...' : isPastDue && currentPlan === 'pro' ? 'Reactivar Mensualidad Pro ($14.99)' : 'Seleccionar Plan Pro ($14.99 USD)'}
                </button>
              )}
            </div>

            {/* PLAN CORPORATIVO */}
            <div className={`rounded-2xl border p-6 flex flex-col justify-between transition-all relative ${
              currentPlan === 'corp' && isSubscribed
                ? 'border-emerald-500 bg-emerald-50/20 shadow-md'
                : 'border-slate-800 bg-slate-900 text-white shadow-md'
            }`}>
              {currentPlan === 'corp' && isSubscribed ? (
                <div className="absolute -top-3 right-4 bg-emerald-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                  Tu Plan Actual
                </div>
              ) : (
                <div className="absolute -top-3 right-4 bg-indigo-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Empresas & ATS
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 font-bold text-base mb-1 text-white">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  Plan Corporativo
                </div>
                <p className="text-[11px] text-slate-400 mb-4">Diseñado para empresas y departamentos de reclutamiento que evalúan candidatos externos.</p>

                <div className="flex items-baseline gap-1 mb-4 pb-4 border-b border-slate-800">
                  <span className="text-3xl font-extrabold text-white">$99.99</span>
                  <span className="text-slate-400 text-xs font-medium">USD / mes</span>
                </div>

                <div className="bg-slate-800/80 rounded-xl p-3 text-center mb-5 border border-slate-700">
                  <span className="text-xs font-bold text-indigo-300">+100 entrevistas acumulativas mensuales</span>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                  <li className="flex items-center gap-2 font-semibold text-emerald-400">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Enlaces de Invitación únicos para Candidatos</span>
                  </li>
                  <li className="flex items-center gap-2 font-semibold text-emerald-400">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Panel ATS & Exportación de Candidatos a CSV</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span><strong>100 Evaluaciones de Voz / mes</strong> (Acumulativas)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Evaluaciones acumulativas mes con mes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Catálogo completo con 30+ roles técnicos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Reportes ejecutivos con Score y Red Flags</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Gestor de cuenta y soporte prioritario 24/7</span>
                  </li>
                </ul>
              </div>

              {currentPlan === 'corp' && isSubscribed ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 py-2.5 px-3 bg-emerald-900/60 text-emerald-300 font-semibold text-xs rounded-xl text-center border border-emerald-700">
                    Plan Activo
                  </div>
                  <button
                    onClick={handleUnsubscribe}
                    disabled={cancelingSubscription}
                    className="py-2.5 px-3 bg-red-950/60 hover:bg-red-900/80 text-red-300 font-semibold text-xs rounded-xl border border-red-800 transition-all cursor-pointer"
                  >
                    Desuscribir
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleSubscribe('corp')}
                  disabled={loadingPlan !== null || cancelingSubscription}
                  className="w-full py-2.5 px-4 font-semibold text-xs rounded-xl transition-all shadow-xs bg-white hover:bg-slate-100 text-slate-900 cursor-pointer"
                >
                  {loadingPlan === 'corp' ? 'Procesando...' : isPastDue && currentPlan === 'corp' ? 'Reactivar Mensualidad Corporativa' : 'Seleccionar Corporativo'}
                </button>
              )}
            </div>

          </div>

          {/* Cumulative & Monthly Validation Explanation Box */}
          <div className="mt-6 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-900 text-sm">¿Cómo funcionan las evaluaciones acumulativas y la validación mensual?</p>
              <p>
                • <strong>Evaluaciones 100% Acumulativas:</strong> La cantidad de evaluaciones no utilizadas durante el mes <strong>no se reinicia a cero</strong>. Todas tus evaluaciones restantes se conservan intactas y se van sumando con cada nueva recarga mensual.
              </p>
              <p>
                • <strong>Validación y Pago Mensual:</strong> Para continuar disfrutando de la plataforma y de tus evaluaciones acumuladas, el pago se valida mensualmente. En caso de pausa en el pago, tus evaluaciones permanecen guardadas hasta que reactives tu mensualidad.
              </p>
            </div>
          </div>

          {isSubscribed && profile?.stripeCustomerId && (
            <div className="mt-8 text-center pt-4 border-t border-slate-100">
              <button
                onClick={handleManageSubscription}
                disabled={loadingPlan !== null}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all"
              >
                <CreditCard className="w-4 h-4" />
                Administrar o Cancelar Suscripción en Stripe
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 mt-6">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              Pagos 100% seguros procesados por Stripe
            </span>
            <span>Cancela o cambia de plan cuando quieras</span>
          </div>
        </div>
      </div>
    </div>
  );
};
