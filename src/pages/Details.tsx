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
  Loader2,
  Download
} from 'lucide-react';
import { generateAuditPDF, savePDFToStorage, getMonitoriaFileName } from '../utils/pdfExport';
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
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
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

  const handleGerarFeedback = async () => {
    if (generatingFeedback) return;
    setGeneratingFeedback(true);
    try {
      const response = await fetch('/api/gerar-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitoria, criterios })
      });

      if (!response.ok) throw new Error('Falha ao gerar feedback');
      const data = await response.json();

      // Update local state
      setMonitoria({ ...monitoria, ...data });

      // Save to Supabase
      const { error } = await supabase.from('monitorias').update({
        feedback_colaborador: data.feedback_colaborador,
        plano_acao: data.plano_acao,
        orientacao_treinamento: data.orientacao_treinamento,
        falhas_criticas: data.falhas_criticas,
        impacto_falhas: data.impacto_falhas
      }).eq('id', id);

      if (error) throw error;
      alert('Feedback detalhado gerado com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao gerar feedback: ' + err.message);
    } finally {
      setGeneratingFeedback(false);
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

  const classificarNota = (nota: number) => {
    if (nota >= 90) return 'Excelente atendimento';
    if (nota >= 80) return 'Bom atendimento';
    if (nota >= 70) return 'Atendimento regular';
    if (nota >= 60) return 'Abaixo do esperado';
    return 'Atendimento crítico';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Calculate final score
      const totalScore = Math.round(criterios.reduce((acc, curr) => acc + (Number(curr.pontuacao_final ?? curr.pontuacao_ia) || 0), 0) * 10) / 10;
      const classificacao = classificarNota(totalScore);
      
      // 2. Update Monitoria
      await supabase.from('monitorias').update({
        nota_final: totalScore,
        classificacao_final: classificacao,
        classificacao: classificacao,
        revisada_manualmente: true,
        revisada_por: user?.email || 'Administrador',
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
    try {
      if (!id) {
        throw new Error('ID da monitoria não informado.');
      }

      const confirmar = window.confirm(
        'Tem certeza que deseja excluir esta monitoria? Essa ação não poderá ser desfeita.'
      );

      if (!confirmar) return;

      setSaving(true);

      // 1. Buscar arquivos no bucket monitoria-arquivos
      const { data: arquivos } = await supabase
        .from('arquivos_monitoria')
        .select('storage_path')
        .eq('monitoria_id', id);

      const paths = arquivos
        ?.map((arquivo) => arquivo.storage_path)
        .filter(Boolean) || [];

      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('monitoria-arquivos')
          .remove(paths);

        if (storageError) {
          console.warn('Erro ao excluir arquivos do Storage:', storageError.message);
        }
      }

      // 2. Buscar PDF no bucket monitoria-pdfs
      const { data: monitoriaRecord } = await supabase
        .from('monitorias')
        .select('pdf_nome')
        .eq('id', id)
        .single();

      if (monitoriaRecord?.pdf_nome) {
        const { error: pdfError } = await supabase.storage
          .from('monitoria-pdfs')
          .remove([monitoriaRecord.pdf_nome]);

        if (pdfError) {
          console.warn('Erro ao excluir PDF:', pdfError.message);
        }
      }

      // 3. Excluir registros do banco em ordem sequencial
      const { error: chatError } = await supabase
        .from('chat_monitoria')
        .delete()
        .eq('monitoria_id', id);

      if (chatError) throw chatError;

      const { error: arquivosError } = await supabase
        .from('arquivos_monitoria')
        .delete()
        .eq('monitoria_id', id);

      if (arquivosError) throw arquivosError;

      const { error: criteriosError } = await supabase
        .from('monitoria_criterios')
        .delete()
        .eq('monitoria_id', id);

      if (criteriosError) throw criteriosError;

      const { error: monitoriaError } = await supabase
        .from('monitorias')
        .delete()
        .eq('id', id);

      if (monitoriaError) throw monitoriaError;

      alert('Monitoria excluída com sucesso.');
      navigate('/admin/historico');

    } catch (error: any) {
      console.error('Erro ao excluir monitoria:', error);
      alert('Erro ao excluir monitoria: ' + (error?.message || 'verifique permissões.'));
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

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error('A rota /api/chat-monitoria não retornou JSON. Resposta: ' + text.slice(0, 100));
      }

      const resData = await response.json();
      
      if (!response.ok) {
        throw new Error(resData.error || 'Falha na resposta do assistente.');
      }

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
    try {
      setSaving(true);
      
      // 1. Generate PDF (await because it's async now)
      const doc = await generateAuditPDF(monitoria, criterios, arquivos);
      
      // 2. Prepare filename
      const fileName = getMonitoriaFileName(monitoria);
      
      // 3. Download locally (MANDATORY AND FIRST)
      doc.save(fileName);
      
      // 4. Try upload to storage
      const result = await savePDFToStorage(doc, monitoria);
      
      if (result.success) {
        alert('PDF gerado e salvo no Storage com sucesso!');
        fetchDetails(); // Refresh to get pdf_url
      } else {
        alert('PDF gerado com sucesso. Não foi possível salvar no Storage, mas o download foi realizado.');
      }
    } catch (err: any) {
      console.error('Erro ao exportar PDF:', err);
      alert('Erro ao gerar PDF: ' + (err.message || 'Erro desconhecido.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
       <Loader2 className="animate-spin text-[#102B52]" size={32} />
    </div>
  );
  if (!monitoria) return <div className="p-20 text-center font-bold text-gray-400">Monitoria não encontrada ou sem permissão.</div>;

  const currentScore = Math.round(criterios.reduce((acc, curr) => acc + (Number(curr.pontuacao_final ?? curr.pontuacao_ia) || 0), 0) * 10) / 10;
  const currentClassificacao = classificarNota(currentScore);

  // Group by criteria for summary cards
  const criteriaData = criterios.reduce((acc: any, curr) => {
    const key = curr.criterio;
    if (!acc[key]) {
      acc[key] = {
        name: key,
        max: 0,
        obtained: 0,
        sim: 0,
        parcial: 0,
        nao: 0,
        items: []
      };
    }
    acc[key].max += Number(curr.peso);
    acc[key].obtained += Number(curr.pontuacao_final || curr.pontuacao_ia || 0);
    const status = curr.status_final || curr.status_ia;
    if (status === 'SIM') acc[key].sim++;
    else if (status === 'PARCIAL') acc[key].parcial++;
    else acc[key].nao++;
    
    acc[key].items.push(curr);
    return acc;
  }, {});

  const criteriaArray = Object.values(criteriaData);
  
  const totalSim = criterios.filter(c => (c.status_final || c.status_ia) === 'SIM').length;
  const totalParcial = criterios.filter(c => (c.status_final || c.status_ia) === 'PARCIAL').length;
  const totalNao = criterios.filter(c => (c.status_final || c.status_ia) === 'NÃO').length;
  const conformity = ((currentScore / 100) * 100).toFixed(1);

  // Find biggest gap
  const sortedByLoss = [...criteriaArray].sort((a: any, b: any) => (b.max - b.obtained) - (a.max - a.obtained));
  const biggestGap = (sortedByLoss[0] as any)?.name || 'N/A';
  const bestPerformance = ([...criteriaArray].sort((a: any, b: any) => (b.obtained / b.max) - (a.obtained / a.max))[0] as any)?.name || 'N/A';

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
            onClick={handleGerarFeedback}
            disabled={generatingFeedback}
            className="flex items-center gap-2 bg-[#4DA8FF] text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#102B52] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {generatingFeedback ? <Loader2 className="animate-spin" size={18} /> : <MessageSquare size={18} />}
            Gerar Feedback Detalhado
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-white border border-gray-100 text-[#102B52] px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
          >
            <FileDown size={18} />
            Exportar Análise em PDF
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
      <div className="bg-[#102B52] rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
          <div>
            <p className="text-[#4DA8FF] text-[10px] uppercase font-black tracking-[0.3em] mb-3">Score Final Auditado</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-7xl font-black tracking-tighter">{currentScore}</h2>
              <span className="text-2xl font-bold opacity-30">/ 100</span>
            </div>
            <div className={`mt-4 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest w-fit border ${
               currentClassificacao.includes('Excelente') ? 'bg-emerald-400 border-emerald-500 text-white' :
               currentClassificacao.includes('Bom') ? 'bg-blue-400 border-blue-500 text-white' :
               currentClassificacao.includes('regular') ? 'bg-amber-400 border-amber-500 text-white' :
               'bg-red-500 border-red-600 text-white'
            }`}>
              {currentClassificacao}
            </div>
          </div>
          
          <div className="space-y-4">
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nota Original IA</p>
                <p className="text-2xl font-black">{monitoria.nota_ia}%</p>
             </div>
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Conformidade Global</p>
                <p className="text-2xl font-black text-[#4DA8FF]">{conformity}%</p>
             </div>
          </div>

          <div className="space-y-4">
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Itens Atendidos</p>
                <div className="flex gap-2 mt-1">
                   <span className="text-emerald-400 font-black">{totalSim} S</span>
                   <span className="text-amber-400 font-black">{totalParcial} P</span>
                   <span className="text-red-400 font-black">{totalNao} N</span>
                </div>
             </div>
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status Feedback</p>
                <p className="text-xs font-black uppercase tracking-widest text-[#4DA8FF]">{monitoria.status_feedback || 'PENDENTE'}</p>
             </div>
          </div>

          <div className="space-y-4">
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Maior Gap (Gargalo)</p>
                <p className="text-xs font-black truncate">{biggestGap}</p>
             </div>
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Melhor Desempenho</p>
                <p className="text-xs font-black truncate">{bestPerformance}</p>
             </div>
          </div>
        </div>
        
        {/* User Info Layer */}
        <div className="mt-10 pt-8 border-t border-white/5 flex flex-wrap items-center justify-between gap-6 relative z-10">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                 <User className="text-[#4DA8FF]" size={20} />
              </div>
              <div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">Colaborador Avaliado</p>
                 <h4 className="text-lg font-black">{monitoria.colaborador}</h4>
              </div>
           </div>
           <div className="flex gap-10">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">Mes Referência</p>
                <p className="font-bold text-[#4DA8FF] uppercase">{monitoria.mes_referencia}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">Auditado por</p>
                <p className="font-bold">{monitoria.revisada_manualmente ? monitoria.revisada_por : 'IA LAGOABOT'}</p>
              </div>
           </div>
        </div>

        {/* Background Accent */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-[#4DA8FF]/10 rounded-full blur-[100px]"></div>
      </div>

      {/* Criteria Cards Conformity View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
         {criteriaArray.map((group: any, idx) => {
            const perc = ((group.obtained / group.max) * 100).toFixed(0);
            return (
              <div key={idx} className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl transition-all">
                <div>
                   <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{group.name}</span>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${
                        Number(perc) === 100 ? 'bg-emerald-100 text-emerald-600' : 
                        Number(perc) >= 70 ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                      }`}>{perc}%</span>
                   </div>
                   <div className="w-full bg-gray-100 h-1.5 rounded-full mb-6 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                           Number(perc) === 100 ? 'bg-emerald-500' : Number(perc) >= 70 ? 'bg-blue-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${perc}%` }}
                      ></div>
                   </div>
                   <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                      <div className="p-2 bg-gray-50 rounded-xl">
                         <p className="text-[8px] font-black text-gray-400 uppercase">SIM</p>
                         <p className="text-xs font-black text-emerald-500">{group.sim}</p>
                      </div>
                      <div className="p-2 bg-gray-50 rounded-xl">
                         <p className="text-[8px] font-black text-gray-400 uppercase">PARC</p>
                         <p className="text-xs font-black text-amber-500">{group.parcial}</p>
                      </div>
                      <div className="p-2 bg-gray-50 rounded-xl">
                         <p className="text-[8px] font-black text-gray-400 uppercase">NÃO</p>
                         <p className="text-xs font-black text-red-500">{group.nao}</p>
                      </div>
                   </div>
                </div>
                <div className="pt-4 border-t border-gray-50 flex justify-between items-center text-[10px] font-black uppercase text-gray-400">
                   <span>Nota Obtida</span>
                   <span className="text-[#102B52]">{group.obtained.toFixed(1)} / {group.max}</span>
                </div>
              </div>
            );
         })}
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
                        <div className="w-1 h-1 bg-gray-200 rounded-full"></div>
                        <span className="text-[10px] font-black text-red-400 uppercase">Perda: {(Number(c.peso) - Number(c.pontuacao_final || c.pontuacao_ia || 0)).toFixed(1)}</span>
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
                          <div className="mt-4 p-4 bg-white/50 rounded-2xl border border-[#4DA8FF]/10">
                             <p className="text-[9px] font-black uppercase text-[#4DA8FF] tracking-widest mb-1">Orientação de Correção</p>
                             <p className="text-xs font-bold text-gray-700">{c.orientacao_correcao || 'Nenhuma orientação específica.'}</p>
                          </div>
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
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 relative overflow-hidden group lg:col-span-2">
              <h3 className="font-black text-[#0B1F3A] mb-6 flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <MessageSquare size={18} />
                </div>
                Feedback Humanizado ao Colaborador
              </h3>
              <div className="markdown-body prose prose-sm text-gray-600 max-w-none">
                <ReactMarkdown>{monitoria.feedback_colaborador}</ReactMarkdown>
              </div>
            </div>
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 relative overflow-hidden group lg:col-span-2">
              <h3 className="font-black text-[#0B1F3A] mb-6 flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg group-hover:bg-purple-500 group-hover:text-white transition-all">
                  <BookOpen size={18} />
                </div>
                Orientação de Treinamento
              </h3>
              <div className="markdown-body prose prose-sm text-gray-600 max-w-none">
                <ReactMarkdown>{monitoria.orientacao_treinamento}</ReactMarkdown>
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
