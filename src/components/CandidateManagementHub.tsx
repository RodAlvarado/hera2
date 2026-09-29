import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { 
  Users, Search, Calendar, Briefcase, ChevronRight, X, Loader2, Award, 
  AlertTriangle, Download, Copy, Check, Mail, Filter, Building2, UserCheck, ExternalLink, Link2
} from 'lucide-react';
import { InterviewRecord } from '../lib/firebase';

interface CandidateManagementHubProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInviteModal?: () => void;
}

export const CandidateManagementHub: React.FC<CandidateManagementHubProps> = ({ 
  isOpen, 
  onClose,
  onOpenInviteModal
}) => {
  const { user, profile } = useAuth();
  const [candidates, setCandidates] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<InterviewRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  const [selectedScoreFilter, setSelectedScoreFilter] = useState('ALL');
  const [copiedReport, setCopiedReport] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadCandidateData();
    }
  }, [isOpen, user]);

  const loadCandidateData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'interviews'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const items: InterviewRecord[] = [];
      snap.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as InterviewRecord);
      });
      setCandidates(items);
      if (items.length > 0 && !selectedCandidate) {
        setSelectedCandidate(items[0]);
      }
    } catch (err) {
      console.error('Error loading candidates in ATS hub:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Filter candidates
  const filteredCandidates = candidates.filter((item) => {
    const matchesSearch = 
      (item.candidateName && item.candidateName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.candidateEmail && item.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      item.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.summary && item.summary.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = selectedRoleFilter === 'ALL' || item.role === selectedRoleFilter;
    
    let matchesScore = true;
    if (selectedScoreFilter === 'HIGH') matchesScore = item.score >= 55;
    else if (selectedScoreFilter === 'MEDIUM') matchesScore = item.score >= 40 && item.score < 55;
    else if (selectedScoreFilter === 'LOW') matchesScore = item.score < 40;
    else if (selectedScoreFilter === 'FLAGS') matchesScore = item.redFlags > 0;

    return matchesSearch && matchesRole && matchesScore;
  });

  // Calculate Metrics
  const totalEvaluations = candidates.length;
  const avgScore = totalEvaluations > 0 
    ? Math.round(candidates.reduce((acc, curr) => acc + (curr.score || 0), 0) / totalEvaluations)
    : 0;
  const candidatesWithFlags = candidates.filter(c => c.redFlags > 0).length;
  const candidateInvitesCount = candidates.filter(c => c.isCandidateInvite || c.candidateEmail).length;

  const rolesInList = Array.from(new Set(candidates.map(c => c.role)));

  // Export to CSV
  const handleExportCSV = () => {
    if (candidates.length === 0) return;
    
    const headers = ['Nombre Candidato', 'Correo', 'Puesto', 'Puntaje', 'Alertas Red Flags', 'Fecha Evaluacion', 'Tipo'];
    const rows = candidates.map(c => [
      `"${c.candidateName || 'N/A'}"`,
      `"${c.candidateEmail || 'N/A'}"`,
      `"${c.role}"`,
      c.score || 0,
      c.redFlags || 0,
      `"${c.createdAt?.toDate ? new Date(c.createdAt.toDate()).toLocaleDateString('es-ES') : 'Reciente'}"`,
      `"${c.isCandidateInvite ? 'Enlace Empresa' : 'Evaluación Directa'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `candidatos_hera_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyReport = () => {
    if (!selectedCandidate) return;
    navigator.clipboard.writeText(selectedCandidate.report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  const userLimit = profile?.interviewsLimit || (profile?.subscriptionPlan === 'corp' ? 100 : profile?.subscriptionPlan === 'pro' ? 20 : 5);
  const userCount = profile?.interviewsCount || candidates.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden relative">
        
        {/* Top Bar */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base tracking-tight">Panel de Candidatos & ATS</h3>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/40 font-semibold">
                  Gestión Corporativa
                </span>
              </div>
              <p className="text-slate-400 text-xs">
                Evaluaciones de candidatos registradas vía enlace único y prácticas de voz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onOpenInviteModal && (
              <button
                onClick={onOpenInviteModal}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                Generar Enlace
              </button>
            )}
            <button
              onClick={handleExportCSV}
              disabled={candidates.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
              title="Exportar a archivo Excel / CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Analytics Header Metrics */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Evaluados</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{totalEvaluations}</p>
          </div>
          
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Promedio Score</p>
            <p className="text-xl font-bold text-indigo-600 mt-0.5">{avgScore} <span className="text-xs text-slate-400 font-normal">/ 75 pts</span></p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Con Red Flags</p>
            <p className={`text-xl font-bold mt-0.5 ${candidatesWithFlags > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
              {candidatesWithFlags}
            </p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cupo Mensual</p>
              <span className="text-[10px] font-bold text-indigo-600">{userCount}/{userLimit}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round((userCount / userLimit) * 100))}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por candidato, correo o puesto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Filter by Role */}
            {rolesInList.length > 0 && (
              <select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 outline-none focus:border-indigo-500 font-medium"
              >
                <option value="ALL">Todos los Puestos</option>
                {rolesInList.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}

            {/* Filter by Score */}
            <select
              value={selectedScoreFilter}
              onChange={(e) => setSelectedScoreFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 outline-none focus:border-indigo-500 font-medium"
            >
              <option value="ALL">Todos los Scores</option>
              <option value="HIGH">Score Alto (≥ 55)</option>
              <option value="MEDIUM">Score Medio (40 - 54)</option>
              <option value="LOW">Score Bajo (&lt; 40)</option>
              <option value="FLAGS">Solo con Red Flags</option>
            </select>
          </div>
        </div>

        {/* Content Body: Sidebar list + Detail view */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Candidates List Column */}
          <div className="w-full md:w-96 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0 overflow-y-auto p-3 space-y-2.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mb-2" />
                <span>Cargando evaluaciones...</span>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="text-center p-8 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs space-y-2">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-600">No se encontraron candidatos</p>
                <p className="text-[11px] text-slate-400">
                  Genera un enlace único de invitación y compártelo con tus postulantes.
                </p>
                {onOpenInviteModal && (
                  <button
                    onClick={onOpenInviteModal}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-[11px] border border-indigo-100 hover:bg-indigo-100 transition-colors"
                  >
                    <Link2 className="w-3 h-3" /> Generar Enlace
                  </button>
                )}
              </div>
            ) : (
              filteredCandidates.map((item) => {
                const isSelected = selectedCandidate?.id === item.id;
                const score = item.score || 0;
                const scoreColor = score >= 55 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : score >= 40 
                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                    : 'bg-red-50 text-red-700 border-red-200';

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedCandidate(item)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all relative ${
                      isSelected 
                        ? 'bg-indigo-50/90 border-indigo-400 shadow-sm ring-1 ring-indigo-400/30' 
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs text-slate-900 truncate max-w-[200px]">
                        {item.candidateName || 'Candidato sin nombre'}
                      </span>
                      <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${scoreColor}`}>
                        {score}/75
                      </span>
                    </div>

                    {item.candidateEmail && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mb-1.5 truncate">
                        <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                        {item.candidateEmail}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium mb-2 bg-slate-50/80 px-2 py-1 rounded-lg">
                      <span className="truncate">{item.role}</span>
                      {item.isCandidateInvite && (
                        <span className="text-[9px] bg-indigo-100/80 text-indigo-700 px-1.5 py-0.2 rounded font-bold uppercase shrink-0">
                          Invite
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleDateString('es-ES') : 'Reciente'}
                      </span>
                      {item.redFlags > 0 ? (
                        <span className="flex items-center gap-0.5 text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          <AlertTriangle className="w-3 h-3" />
                          {item.redFlags} Red Flags
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                          ✓ Sin Alertas
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Candidate Detailed Report View */}
          <div className="hidden md:flex flex-1 flex-col overflow-y-auto bg-white">
            {selectedCandidate ? (
              <div className="p-6 md:p-8 space-y-6">
                {/* Candidate Overview Card */}
                <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                    <div>
                      <span className="text-[10px] bg-indigo-500/30 text-indigo-300 font-bold px-2.5 py-1 rounded-full border border-indigo-500/40 uppercase tracking-wider">
                        Reporte de Evaluación HERA
                      </span>
                      <h4 className="text-2xl font-bold text-white mt-2">
                        {selectedCandidate.candidateName || 'Candidato'}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>Puesto: <strong className="text-slate-200">{selectedCandidate.role}</strong></span>
                        {selectedCandidate.candidateEmail && (
                          <span>• Correo: <strong className="text-slate-200">{selectedCandidate.candidateEmail}</strong></span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-5 py-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-slate-300">Puntaje</p>
                        <p className="text-2xl font-extrabold text-indigo-400">{selectedCandidate.score}/75</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-5 py-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-slate-300">Red Flags</p>
                        <p className={`text-2xl font-extrabold ${selectedCandidate.redFlags > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {selectedCandidate.redFlags}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                      Fecha de evaluación: {selectedCandidate.createdAt?.toDate ? new Date(selectedCandidate.createdAt.toDate()).toLocaleString('es-ES') : 'Reciente'}
                    </p>
                    <button
                      onClick={handleCopyReport}
                      className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedReport ? 'Copiado al portapapeles' : 'Copiar Reporte'}
                    </button>
                  </div>
                </div>

                {/* Markdown Evaluation Details */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6">
                  <div className="prose prose-slate max-w-none text-xs leading-relaxed">
                    <ReactMarkdown>{selectedCandidate.report}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs">
                <Users className="w-12 h-12 text-slate-200 mb-3" />
                <p className="font-semibold text-slate-600 text-sm">Ningún candidato seleccionado</p>
                <p className="max-w-xs mt-1">Selecciona una evaluación de la lista izquierda para visualizar el análisis detallado.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
