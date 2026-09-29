import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { HeraLogo } from './HeraLogo';
import { Mail, Lock, User as UserIcon, AlertCircle, X, CheckCircle2, Send } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail, sendVerificationEmail } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState(false);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Google');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isSignUp) {
        if (!name.trim()) throw new Error('Por favor ingresa tu nombre');
        await signUpWithEmail(email, password, name);
        setRegisteredEmail(email);
      } else {
        await loginWithEmail(email, password);
        onClose();
      }
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Correo o contraseña incorrectos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este correo ya está registrado.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setError(err.message || 'Error durante la autenticación');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendVerificationEmail();
      setResendNotice(true);
      setTimeout(() => setResendNotice(false), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Banner */}
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-[#07152B] px-6 py-8 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="flex justify-center mb-3">
            <HeraLogo size="lg" />
          </div>
          <h3 className="text-xl font-bold tracking-tight">HERA SaaS</h3>
          <p className="text-indigo-200 text-xs mt-1">Human Evaluation &amp; Recruitment AI</p>
        </div>

        {/* Body */}
        <div className="p-6">
          {registeredEmail ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900">¡Cuenta Creada Exitosamente!</h4>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Hemos enviado un correo de verificación a <span className="font-semibold text-slate-900">{registeredEmail}</span>.
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Por favor revisa tu bandeja de entrada o carpeta de spam para verificar tu dirección de correo electrónico.
                </p>
              </div>

              {resendNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                  ✓ Correo de verificación reenviado correctamente.
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md transition-all"
                >
                  Entendido y Continuar
                </button>
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="inline-flex items-center justify-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold py-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  {resending ? 'Reenviando...' : 'Reenviar enlace de verificación'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                <button
                  onClick={() => { setIsSignUp(false); setError(null); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    !isSignUp ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Iniciar Sesión
                </button>
                <button
                  onClick={() => { setIsSignUp(true); setError(null); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    isSignUp ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Crear Cuenta
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-xl transition-all shadow-sm mb-4 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Continuar con Google
              </button>

              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-3 text-[10px] text-slate-400 font-semibold uppercase tracking-wider absolute">O con tu correo</span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {isSignUp && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nombre Completo</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ej. Carlos Mendoza"
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@empresa.com"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contraseña</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 transition-all mt-2 disabled:opacity-50"
                >
                  {submitting ? 'Procesando...' : isSignUp ? 'Crear Cuenta Gratis' : 'Iniciar Sesión'}
                </button>
              </form>

              <p className="text-[11px] text-slate-500 text-center mt-4">
                Al registrarte aceptas las políticas de privacidad y términos de servicio de HERA Recruit AI.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
