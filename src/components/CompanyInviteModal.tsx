import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLES_BY_CATEGORY } from '../roles';
import { Link2, Copy, Check, Share2, Mail, MessageCircle, X, Sparkles, Building2 } from 'lucide-react';

interface CompanyInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRole?: string;
}

export const CompanyInviteModal: React.FC<CompanyInviteModalProps> = ({ isOpen, onClose, defaultRole }) => {
  const { user, profile } = useAuth();
  const [selectedRole, setSelectedRole] = useState(defaultRole || 'SEO Specialist');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !user) return null;

  const origin = window.location.origin;
  const inviteUrl = `${origin}?invite=${user.uid}&role=${encodeURIComponent(selectedRole)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `Hola! Te invitamos a realizar tu entrevista de evaluación técnica para la posición de *${selectedRole}* con nuestra reclutadora de IA (HERA).\n\nPuedes ingresar desde tu computadora o celular en el siguiente enlace:\n${inviteUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(`Evaluación Técnica para la posición de ${selectedRole}`);
    const body = encodeURIComponent(
      `Hola,\n\nTe invitamos a completar tu evaluación inicial para la posición de ${selectedRole} a través de nuestra plataforma de reclutamiento con IA (HERA).\n\nEnlace de evaluación:\n${inviteUrl}\n\nRecomendaciones:\n- Asegúrate de estar en un lugar silencioso.\n- Concede permisos de micrófono a tu navegador.\n- La entrevista toma aproximadamente 3 a 5 minutos.\n\n¡Mucho éxito!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  const isCorp = profile?.subscriptionPlan === 'corp';
  const quotaRemaining = Math.max(0, (profile?.interviewsLimit || 2) - (profile?.interviewsCount || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden relative">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-6 text-white flex items-center justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                Generar Enlace para Candidatos
                {isCorp && (
                  <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/40">
                    B2B Empresa
                  </span>
                )}
              </h3>
              <p className="text-slate-400 text-xs">Crea un link único para que tus postulantes hagan la entrevista</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors relative z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Quota Notice */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  {profile?.displayName || user.email}
                </p>
                <p className="text-[11px] text-slate-500">
                  Cupos disponibles: <strong className="text-indigo-600 font-bold">{quotaRemaining} evaluaciones</strong> restantes
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-full border border-slate-200">
              {profile?.subscriptionPlan === 'corp' ? 'Plan Corporativo' : profile?.subscriptionPlan === 'pro' ? 'Plan Pro' : profile?.subscriptionPlan === 'basic' ? 'Plan Básico' : 'Prueba Gratuita'}
            </span>
          </div>

          {/* Role Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Puesto o Vacante a Evaluar:
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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

          {/* Generated URL Card */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Enlace de Evaluación Exclusivo:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 select-all font-mono"
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                  copied 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              El candidato ingresará su nombre, apellido y correo antes de iniciar la llamada con HERA.
            </p>
          </div>

          {/* Direct Share Buttons */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-600 mb-3">Compartir directamente:</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={shareWhatsApp}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                WhatsApp
              </button>
              <button
                onClick={shareEmail}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
              >
                <Mail className="w-4 h-4 text-indigo-600" />
                Correo Electrónico
              </button>
            </div>
          </div>

          {/* Instructions Box */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5 text-xs text-indigo-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              💡 ¿Cómo funciona para tu empresa?
            </p>
            <p className="text-[11px] text-indigo-800/80 leading-relaxed">
              1. El candidato abre el link sin necesidad de pagar ni crear cuenta.<br />
              2. HERA le realiza las 3 preguntas técnicas de voz.<br />
              3. El reporte con el puntaje y análisis se guardará automáticamente en tu <strong>Panel de Candidatos</strong>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
