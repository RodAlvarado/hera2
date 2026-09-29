import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { FileText, Search, Calendar, Briefcase, ChevronRight, X, Loader2, Award, AlertTriangle } from 'lucide-react';

interface InterviewHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

interface InterviewItem {
  id: string;
  role: string;
  candidateName?: string;
  report: string;
  score: number;
  redFlags: number;
  summary: string;
  createdAt: any;
}

export const InterviewHistory: React.FC<InterviewHistoryProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InterviewItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      loadHistory();
    }
  }, [isOpen, user]);

  const loadHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'interviews'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const items: InterviewItem[] = [];
      snap.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as InterviewItem);
      });
      setInterviews(items);
    } catch (err) {
      console.error('Error loading interviews history:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filtered = interviews.filter(item => 
    item.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.candidateName && item.candidateName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.summary && item.summary.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-base">Historial de Entrevistas</h3>
              <p className="text-slate-400 text-xs">Evaluaciones de candidatos guardadas en Firestore</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar List */}
          <div className="w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
            {/* Search Input */}
            <div className="p-3 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por rol o candidato..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando historial...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center p-6 text-slate-400 text-xs">
                  No se encontraron entrevistas guardadas.
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedItem?.id === item.id 
                        ? 'bg-indigo-50/80 border-indigo-300 shadow-sm' 
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-slate-800 truncate">{item.role}</span>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                        {item.score}/75
                      </span>
                    </div>
                    {item.candidateName && (
                      <p className="text-[11px] text-slate-600 font-medium mb-1">{item.candidateName}</p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleDateString('es-ES') : 'Reciente'}
                      </span>
                      {item.redFlags > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          {item.redFlags}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Main Detail View */}
          <div className="hidden md:flex flex-1 flex-col overflow-y-auto p-6 bg-white">
            {selectedItem ? (
              <div className="prose prose-slate max-w-none text-xs">
                <ReactMarkdown>{selectedItem.report}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                <FileText className="w-12 h-12 text-slate-200 mb-3" />
                <p>Selecciona una entrevista de la lista para ver el reporte completo de HERA.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
