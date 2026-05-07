import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Eye, 
  Trash2, 
  FileDown, 
  Search, 
  Filter, 
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

export default function History() {
  const [monitorias, setMonitorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchMonitorias();

    const channel = supabase
      .channel('history-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        fetchMonitorias();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMonitorias = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('monitorias')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setMonitorias(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string | null) => {
    if (!id) return;
    if (window.confirm('Tem certeza que deseja excluir esta monitoria? Essa ação não poderá ser desfeita.')) {
      setLoading(true);
      try {
        console.log('Iniciando exclusão da monitoria:', id);

        // 1. Buscar arquivos vinculados
        const { data: arquivos, error: arquivosError } = await supabase
          .from('arquivos_monitoria')
          .select('storage_path')
          .eq('monitoria_id', id);
        
        if (arquivosError) console.warn('Erro ao buscar arquivos:', arquivosError.message);

        // 2. Encontrar monitoria no estado local para dados de PDF
        const monitoria = monitorias.find(m => m.id === id);
        const filePaths = arquivos?.map(f => f.storage_path).filter(Boolean) || [];

        // 3. Remover do Storage API - monitoria-arquivos
        if (filePaths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from('monitoria-arquivos')
            .remove(filePaths);
          if (storageError) console.warn('Erro ao excluir arquivos do Storage:', storageError.message);
        }

        // 4. Remover PDF do Storage API - monitoria-pdfs
        if (monitoria?.pdf_nome) {
          const { error: pdfError } = await supabase.storage
            .from('monitoria-pdfs')
            .remove([monitoria.pdf_nome]);
          if (pdfError) console.warn('Erro ao excluir PDF do Storage:', pdfError.message);
        } else if (monitoria?.pdf_url) {
          const pdfPath = monitoria.pdf_url.split('/monitoria-pdfs/')[1];
          if (pdfPath) {
            const { error: pdfError } = await supabase.storage
              .from('monitoria-pdfs')
              .remove([decodeURIComponent(pdfPath)]);
            if (pdfError) console.warn('Erro ao excluir PDF via URL:', pdfError.message);
          }
        }

        // 5. Deletar registros sequencialmente
        const { error: chatError } = await supabase.from('chat_monitoria').delete().eq('monitoria_id', id);
        if (chatError) throw chatError;

        const { error: arquivosDeleteError } = await supabase.from('arquivos_monitoria').delete().eq('monitoria_id', id);
        if (arquivosDeleteError) throw arquivosDeleteError;

        const { error: criteriosError } = await supabase.from('monitoria_criterios').delete().eq('monitoria_id', id);
        if (criteriosError) throw criteriosError;

        const { error: monitoriaError } = await supabase.from('monitorias').delete().eq('id', id);
        if (monitoriaError) throw monitoriaError;
        
        alert('Monitoria excluída com sucesso.');
        fetchMonitorias(); // Recarregar histórico
        // Dashboard será atualizado via realtime se implementado, ou recarregado na próxima visita
      } catch (err: any) {
        console.error('Erro ao excluir monitoria:', err);
        alert('Erro ao excluir monitoria: ' + (err.message || String(err)));
      } finally {
        setLoading(false);
      }
    }
  };

  const filtered = monitorias.filter(m => 
    m.colaborador.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.mes_referencia.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && monitorias.length === 0) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#102B52]"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por colaborador ou mês..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-100 bg-white focus:ring-4 focus:ring-[#4DA8FF]/10 outline-none transition-all font-medium text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-white px-5 py-3.5 rounded-2xl border border-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all">
            <Filter size={18} />
            Filtros Avançados
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[120px]">Data / Mês</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Tipo</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Nota IA</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Nota Final</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Revisada</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length > 0 ? filtered.map((m, i) => {
                const notaFinalValue = Number(m.nota_final) || Number(m.nota_ia) || 0;
                return (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={m.id} 
                    className="group hover:bg-gray-50/80 transition-all"
                  >
                    <td className="px-8 py-5">
                      <p className="font-bold text-[#0B1F3A] text-sm">{m.mes_referencia}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{new Date(m.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#0B1F3A]">{m.colaborador}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{m.avaliador}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        m.tipo_atendimento === 'SDR' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                      }`}>
                        {m.tipo_atendimento}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center font-black text-gray-300">{m.nota_ia}%</td>
                    <td className="px-6 py-5 text-center">
                      <span className={`font-black ${
                        notaFinalValue >= 90 ? 'text-emerald-500' : 
                        notaFinalValue >= 80 ? 'text-blue-500' : 'text-red-500'
                      }`}>
                        {notaFinalValue}%
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      {m.revisada_manualmente ? (
                        <span className="text-emerald-500 bg-emerald-50 px-2 py-1 rounded text-[10px] font-black uppercase tracking-tight inline-flex items-center gap-1">
                          <TrendingUp size={10} /> Sim
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[10px] font-black uppercase tracking-tight">Não</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => navigate(`/admin/monitoria/${m.id}`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Ver Detalhes"
                        >
                          <Eye size={18} />
                        </button>
                        <button 
                         onClick={() => m.pdf_url && window.open(m.pdf_url, '_blank')}
                         disabled={!m.pdf_url}
                         className={`p-2 rounded-lg transition-colors ${m.pdf_url ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-200 cursor-not-allowed'}`}
                         title="Baixar PDF"
                        >
                          <FileDown size={18} />
                        </button>
                        <button 
                         onClick={() => handleDelete(m.id)}
                         className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                         title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                        <ChevronRight size={16} className="text-gray-300 group-hover:text-[#4DA8FF] group-hover:translate-x-1 transition-all" />
                      </div>
                    </td>
                  </motion.tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-gray-400 font-bold">Nenhuma monitoria encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
