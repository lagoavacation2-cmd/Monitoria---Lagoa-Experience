import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../App';
import { 
  FileDown, 
  MessageSquare, 
  Save, 
  ArrowLeft, 
  CheckCircle2, 
  HelpCircle, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  User,
  Bot,
  Send,
  Trash2,
  Loader2
} from 'lucide-react';
import { generateAuditPDF } from '../utils/pdfExport';
import ReactMarkdown from 'react-markdown';

export default function Details() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [monitoria, setMonitoria] = useState<any>(null);
  const [criterios, setCriterios] = useState<any[]>([]);
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [chat, setChat] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDetails();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const { data: monitoriaData } = await supabase.from('monitorias').select('*').eq('id', id).single();
      const { data: criteriosData } = await supabase.from('monitoria_criterios').select('*').eq('monitoria_id', id).order('created_at', { ascending: true });
      const { data: arquivosData } = await supabase.from('arquivos_monitoria').select('*').eq('monitoria_id', id);
      const { data: chatData } = await supabase.from('chat_monitoria').select('*').eq('monitoria_id', id).order('created_at', { ascending: true });

      setMonitoria(monitoriaData);
      setCriterios(criteriosData || []);
      setArquivos(arquivosData || []);
      setChat(chatData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateCriterio = (idx: number, field: string, value: any) => {
    const newCriterios = [...criterios];
    newCriterios[idx] = { ...newCriterios[idx], [field]: value };
    
    // Recalculate score for this item if status changes
    if (field === 'status_final') {
      const peso = Number(newCriterios[idx].peso);
      if (value === 'SIM') newCriterios[idx].pontuacao_final = peso;
      else if (value === 'PARCIAL') newCriterios[idx].pontuacao_final = peso * 0.5;
      else newCriterios[idx].pontuacao_final = 0;
    }
    
    setCriterios(newCriterios);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Calculate final score
      const totalScore = criterios.reduce((acc, curr) => acc + (Number(curr.pontuacao_final) || 0), 0);
      const classificacao = totalScore >= 90 ? 'Excelente' : totalScore >= 80 ? 'Bom' : totalScore >= 70 ? 'Regular' : 'Crítico';
      
      // 2. Update Monitoria
      await supabase.from('monitorias').update({
        nota_final: totalScore,
        classificacao_ia: classificacao, // Updates main classification
        revisada_manualmente: true,
        revisada_por: user || 'Administrador',
        revisada_em: new Date().toISOString()
      }).eq('id', id);

      // 3. Update Criterios
      for (const crit of criterios) {
        await supabase.from('monitoria_criterios').update({
          status_final: crit.status_final || crit.status_ia,
          pontuacao_final: crit.pontuacao_final ?? crit.pontuacao_ia,
          observacao_admin: crit.observacao_admin,
          ajustado_manualmente: (crit.status_final || crit.status_ia) !== crit.status_ia
        }).eq('id', crit.id);
      }

      await fetchDetails();
      alert('Monitoria auditada e salva com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar monitoria.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Tem certeza que deseja excluir esta monitoria? Essa ação não poderá ser desfeita.')) return;
    
    setSaving(true);
    try {
      // 1. Fetch related files for storage cleanup
      const { data: files } = await supabase.from('arquivos_monitoria').select('storage_path').eq('monitoria_id', id);
      
      // 2. Delete from monitoria-arquivos bucket
      const paths = files?.map(f => f.storage_path).filter(Boolean) || [];
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('monitoria-arquivos')
          .remove(paths);
        if (storageError) console.warn('Erro ao excluir arquivos:', storageError.message);
      }

      // 3. Delete PDF from monitoria-pdfs bucket
      if (monitoria?.pdf_url) {
        const pdfPath = monitoria.pdf_url.split('/monitoria-pdfs/')[1];
        if (pdfPath) {
          const { error: pdfError } = await supabase.storage
            .from('monitoria-pdfs')
            .remove([decodeURIComponent(pdfPath)]);
          if (pdfError) console.warn('Erro ao excluir PDF:', pdfError.message);
        }
      }

      // 4. Delete records in order
      await supabase.from('chat_monitoria').delete().eq('monitoria_id', id);
      await supabase.from('arquivos_monitoria').delete().eq('monitoria_id', id);
      await supabase.from('monitoria_criterios').delete().eq('monitoria_id', id);
      const { error } = await supabase.from('monitorias').delete().eq('id', id);
      
      if (error) throw error;
      
      alert('Monitoria excluída com sucesso.');
      navigate('/admin/historico');
    } catch (err) {
      console.error('Erro ao excluir monitoria:', err);
      alert('Erro ao excluir monitoria: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleSendChat = async () => {
    if (!newMessage.trim() || chatLoading) return;
    
    const userMsg = newMessage;
    setNewMessage('');
    setChatLoading(true);

    try {
      // Save user message
      const { data: userMsgData } = await supabase.from('chat_monitoria').insert({
        monitoria_id: id,
        autor: 'Administrador',
        mensagem: userMsg
      }).select().single();
      
      setChat(prev => [...prev, userMsgData]);

      // Call IA
      const response = await fetch('/api/chat-monitoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monitoria,
          historico: chat,
          mensagem: userMsg
        })
      });

      const resData = await response.json();

      // Save IA message
      const { data: iaMsgData } = await supabase.from('chat_monitoria').insert({
        monitoria_id: id,
        autor: 'IA',
        mensagem: resData.mensagem
      }).select().single();

      setChat(prev => [...prev, iaMsgData]);
    } catch (err) {
      console.error(err);
    } finally {
      setChatLoading(false);
    }
  };

  const applyStatusChange = (critId: string, status: string) => {
    const idx = criterios.findIndex(c => c.id === critId);
    if (idx === -1) return;
    updateCriterio(idx, 'status_final', status);
  };

  const handleExportPDF = async () => {
    const doc = generateAuditPDF(monitoria, criterios);
    const fileName = `Monitoria_${monitoria.colaborador}_${monitoria.mes_referencia}.pdf`.replace(/\s+/g, '_');
    
    // Download locally
    doc.save(fileName);

    // Upload to Supabase Storage
    try {
      const pdfBlob = doc.output('blob');
      const storagePath = `${monitoria.id}/${Date.now()}_${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('monitoria-pdfs')
        .upload(storagePath, pdfBlob);

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from('monitoria-pdfs')
        .getPublicUrl(storagePath);

      await supabase.from('monitorias').update({
        pdf_nome: fileName,
        pdf_url: publicUrl.publicUrl
      }).eq('id', monitoria.id);

      console.log('PDF saved to storage');
    } catch (err) {
      console.error('Error saving PDF to storage:', err);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
       <Loader2 className="animate-spin text-[#102B52]" size={32} />
    </div>
  );
  if (!monitoria) return <div className="p-20 text-center font-bold text-gray-400">Monitoria não encontrada ou sem permissão.</div>;

  const currentScore = criterios.reduce((acc, curr) => acc + (Number(curr.pontuacao_final) || 0), 0);
  const currentClassificacao = currentScore >= 90 ? 'Excelente' : currentScore >= 80 ? 'Bom' : currentScore >= 70 ? 'Regular' : 'Crítico';

  return (
    <div className="space-y-8 pb-20">
      {/* Header Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button 
          onClick={() => navigate('/admin/historico')}
          className="flex items-center gap-2 text-gray-400 hover:text-[#102B52] font-bold text-sm uppercase tracking-widest transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para Histórico
        </button>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-white border border-gray-100 text-[#102B52] px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
          >
            <FileDown size={18} />
            Exportar PDF
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#102B52] text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#4DA8FF] transition-all shadow-xl shadow-blue-900/10 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Salvar Ajustes da Monitoria
          </button>
          <button 
            onClick={handleDelete}
            disabled={saving}
            className="flex items-center gap-2 bg-red-50 text-red-600 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Trash2 size={18} />
            Excluir
          </button>
        </div>
      </div>

      {/* Main Stats Banner */}
      <div className="bg-[#102B52] rounded-[2.5rem] p-12 text-white grid grid-cols-1 md:grid-cols-4 gap-8 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[#4DA8FF] text-[10px] uppercase font-black tracking-[0.3em] mb-3">Score Atualizado</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-7xl font-black tracking-tighter">{currentScore}</h2>
            <span className="text-2xl font-bold opacity-30">/ 100</span>
          </div>
          <div className={`mt-4 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest w-fit border ${
             currentClassificacao === 'Excelente' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' :
             currentClassificacao === 'Bom' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' :
             'bg-red-500/20 border-red-500/30 text-red-400'
          }`}>
            {currentClassificacao}
          </div>
        </div>
        <div className="relative z-10 flex flex-col justify-end">
          <p className="text-gray-400 text-[10px] uppercase font-black tracking-widest mb-1">Colaborador</p>
          <p className="text-2xl font-black tracking-tight">{monitoria.colaborador}</p>
          <p className="text-xs text-[#4DA8FF] font-bold uppercase tracking-widest mt-1">{monitoria.tipo_atendimento}</p>
        </div>
        <div className="relative z-10 flex flex-col justify-end">
          <p className="text-gray-400 text-[10px] uppercase font-black tracking-widest mb-1">Período de Ref.</p>
          <p className="text-2xl font-black tracking-tight uppercase">{monitoria.mes_referencia}</p>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Ref. Monitoria #{monitoria.numero_monitoria_mes}</p>
        </div>
        <div className="relative z-10 flex flex-col justify-end">
          <p className="text-gray-400 text-[10px] uppercase font-black tracking-widest mb-1">Status da Auditoria</p>
          {monitoria.revisada_manualmente ? (
            <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-4 py-3 rounded-2xl">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
              <div>
                <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Revisada Manualmente</p>
                <p className="text-[8px] text-purple-400/60 font-bold uppercase overflow-hidden truncate max-w-[120px]">Por: {monitoria.revisada_por}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-[#4DA8FF]/10 border border-[#4DA8FF]/30 px-4 py-3 rounded-2xl">
              <div className="w-2 h-2 rounded-full bg-[#4DA8FF] animate-pulse"></div>
              <div>
                 <p className="text-[10px] font-black text-[#4DA8FF] uppercase tracking-widest">IA Original</p>
                 <p className="text-[8px] text-[#4DA8FF]/60 font-bold uppercase">Awaiting admin review</p>
              </div>
            </div>
          )}
        </div>
        {/* Background Accent */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-[#4DA8FF]/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-10">
          {/* Detailed Criteria */}
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
              <div>
                <h3 className="text-xl font-black text-[#0B1F3A] tracking-tight">Análise Detalhada por Item</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Ajuste os status finais e pontuações conforme auditoria</p>
              </div>
              <CheckCircle2 size={24} className="text-[#4DA8FF] opacity-30" />
            </div>
            <div className="divide-y divide-gray-50">
              {criterios.map((c, i) => (
                <div key={i} className="p-8 group hover:bg-gray-50/50 transition-all">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] font-black text-[#4DA8FF] uppercase tracking-[0.2em]">{c.criterio}</span>
                        <div className="w-1 h-1 bg-gray-200 rounded-full"></div>
                        <span className="text-[10px] font-bold text-gray-300 uppercase">Peso: {c.peso}</span>
                      </div>
                      <h4 className="font-black text-[#0B1F3A] text-xl leading-tight mb-4 group-hover:text-[#4DA8FF] transition-colors">{c.item_avaliado}</h4>
                      
                      <div className="space-y-4">
                        <div className="bg-[#D9EEFF]/20 p-5 rounded-3xl text-sm text-[#0B1F3A] leading-relaxed border border-[#4DA8FF]/5">
                          <div className="flex items-center gap-2 mb-2">
                             <Bot size={14} className="text-[#4DA8FF]" />
                             <span className="text-[10px] font-black uppercase text-[#4DA8FF] tracking-widest">Parecer da Inteligência Artificial</span>
                             {c.ajustado_manualmente && (
                               <span className="ml-auto text-[8px] font-black bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full uppercase">Alterado</span>
                             )}
                          </div>
                          <p className="italic text-gray-600">"{c.comentario_ia}"</p>
                          <div className="mt-3 flex items-center gap-2">
                             <span className="text-[9px] font-black uppercase text-gray-400">Status IA:</span>
                             <span className={`text-[9px] font-black uppercase ${
                               c.status_ia === 'SIM' ? 'text-emerald-500' : c.status_ia === 'PARCIAL' ? 'text-amber-500' : 'text-red-500'
                             }`}>{c.status_ia} ({c.pontuacao_ia} pts)</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Evidência / Fonte</label>
                              <div className="text-xs font-bold text-[#0B1F3A] bg-gray-100/50 px-4 py-3 rounded-xl border border-gray-100 uppercase tracking-tight">
                                {c.fonte_evidencia || 'Análise de Sentimento / Transcrição'}
                              </div>
                           </div>
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Status Auditor GESTOR</label>
                              <select
                                value={c.status_final || c.status_ia}
                                onChange={(e) => updateCriterio(i, 'status_final', e.target.value)}
                                className={`w-full px-4 py-3 rounded-xl font-black text-xs border outline-none transition-all shadow-sm ${
                                  (c.status_final || c.status_ia) === 'SIM' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 focus:ring-emerald-500/10' :
                                  (c.status_final || c.status_ia) === 'PARCIAL' ? 'bg-amber-50 border-amber-200 text-amber-700 focus:ring-amber-500/10' :
                                  'bg-red-50 border-red-200 text-red-700 focus:ring-red-500/10'
                                }`}
                              >
                                <option value="SIM">SIM (100% Conforme)</option>
                                <option value="PARCIAL">PARCIAL (50% Conforme)</option>
                                <option value="NÃO">NÃO (Não Conforme)</option>
                              </select>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase text-gray-400 ml-1 tracking-[0.1em]">Notas da Auditoria / Justificativa</label>
                      <span className="text-[9px] font-bold text-gray-300">Este comentário sairá no PDF para o colaborador</span>
                    </div>
                    <textarea 
                      value={c.observacao_admin || ''}
                      onChange={(e) => updateCriterio(i, 'observacao_admin', e.target.value)}
                      placeholder="Ex: Auditoria interna validou que o colaborador realizou o vínculo emocional de forma clara aos 03:45 do áudio."
                      className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl p-5 text-sm font-medium text-[#0B1F3A] outline-none focus:bg-white focus:ring-4 focus:ring-[#4DA8FF]/5 transition-all min-h-[100px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feedback & Action Plan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 relative overflow-hidden group">
              <h3 className="font-black text-[#0B1F3A] mb-6 flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <HelpCircle size={18} />
                </div>
                Resumo Geral
              </h3>
              <div className="markdown-body prose prose-sm text-gray-600 max-w-none">
                <ReactMarkdown>{monitoria.resumo_geral}</ReactMarkdown>
              </div>
            </div>
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 relative overflow-hidden group">
              <h3 className="font-black text-[#0B1F3A] mb-6 flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <AlertCircle size={18} />
                </div>
                Plano de Ação Sugerido
              </h3>
              <div className="markdown-body prose prose-sm text-gray-600 max-w-none">
                <ReactMarkdown>{monitoria.plano_acao}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8 lg:sticky lg:top-24 h-[calc(100vh-140px)] flex flex-col">
          {/* Chat with IA */}
          <div className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden flex flex-col flex-1">
            <div className="p-6 bg-[#102B52] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-[#1A3A63] flex items-center justify-center">
                    <Bot size={20} className="text-[#4DA8FF]" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#102B52]"></div>
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-tight leading-none">IA LAGOABOT</h3>
                  <span className="text-[9px] font-black uppercase text-[#4DA8FF] tracking-widest opacity-60">Consultor Especialista</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/80">
              {chat.length === 0 && (
                <div className="text-center py-20 px-8">
                  <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                    <MessageSquare className="text-[#4DA8FF]" size={32} />
                  </div>
                  <h4 className="font-black text-[#0B1F3A] mb-2 uppercase text-xs tracking-widest">Suporte à Auditoria</h4>
                  <p className="text-xs text-gray-400 font-medium leading-relaxed italic">"Pergunte sobre qualquer item marcado como Parcial ou peça justificativas para melhorar o feedback."</p>
                </div>
              )}
              {chat.map((msg, i) => (
                <div key={i} className={`flex ${msg.autor === 'IA' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[90%] p-4 rounded-3xl text-sm ${
                    msg.autor === 'IA' 
                      ? 'bg-white border border-gray-200 text-[#0B1F3A] shadow-sm rounded-tl-none font-medium' 
                      : 'bg-[#102B52] text-white rounded-tr-none shadow-xl font-medium'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                       {msg.autor === 'IA' ? <Bot size={12} className="text-[#4DA8FF]" /> : <User size={12} className="opacity-40" />}
                       <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{msg.autor}</span>
                    </div>
                    <div className="markdown-body text-xs leading-relaxed">
                      <ReactMarkdown>{msg.mensagem}</ReactMarkdown>
                    </div>

                    {msg.autor === 'IA' && msg.mensagem.toLowerCase().includes('status') && (
                      <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                         <button className="text-[9px] font-black uppercase border border-emerald-200 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-500 hover:text-white transition-all">Alterar para SIM</button>
                         <button className="text-[9px] font-black uppercase border border-amber-200 bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-500 hover:text-white transition-all">PARCIAL</button>
                         <button className="text-[9px] font-black uppercase border border-red-200 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-500 hover:text-white transition-all">NÃO</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-6 bg-white border-t border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-2 border border-gray-200 focus-within:ring-4 focus-within:ring-[#4DA8FF]/5 focus-within:bg-white transition-all">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Justifique ou peça reanálise..."
                  className="flex-1 bg-transparent py-4 text-sm font-medium outline-none text-[#0B1F3A]"
                />
                <button 
                  onClick={handleSendChat}
                  disabled={chatLoading || !newMessage.trim()}
                  className="p-3 bg-[#102B52] text-white rounded-xl hover:bg-[#4DA8FF] transition-all disabled:opacity-50 shadow-lg"
                >
                  {chatLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              <div className="mt-3 text-center">
                 <button 
                   onClick={() => setNewMessage('')}
                   className="text-[9px] font-black uppercase text-gray-300 hover:text-red-400 transition-colors"
                 >
                   Limpar Campo de Texto
                 </button>
              </div>
            </div>
          </div>

          {/* Analyzed Files Info */}
          <div className="bg-[#102B52] rounded-[2rem] p-8 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="font-black text-[10px] uppercase text-[#4DA8FF] opacity-60 mb-6 tracking-[0.3em]">Arquivos da Monitoria</h3>
              <div className="space-y-3">
                {arquivos.map((file, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-white p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all cursor-pointer group">
                    <div className="w-8 h-8 rounded-lg bg-[#4DA8FF]/10 flex items-center justify-center group-hover:bg-[#4DA8FF] transition-all">
                      <CheckCircle2 size={16} className="text-[#4DA8FF] group-hover:text-white transition-all" />
                    </div>
                    <span className="font-bold truncate opacity-80 group-hover:opacity-100">{file.nome_arquivo}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -left-10 -top-10 w-40 h-40 bg-[#4DA8FF]/5 rounded-full blur-2xl"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
