import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Send, Loader2, CheckCircle2, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { extractTextFromFile } from '../utils/fileExtract';
import { supabase, checkSupabaseConnection } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [tipo, setTipo] = useState<'SDR' | 'Closer'>('SDR');
  const [colaborador, setColaborador] = useState('');
  const [avaliador, setAvaliador] = useState('');
  const [mes, setMes] = useState(new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' }));
  const [numeroMonitoria, setNumeroMonitoria] = useState<1 | 2>(1);
  const [observacoes, setObservacoes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; bucketsOk?: boolean; message: string } | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function verify() {
      const status = await checkSupabaseConnection();
      setConnectionStatus(status);
      if (!status.ok) {
        setError(status.message);
      } else if (status.bucketsOk === false) {
        setStorageWarning('Os arquivos não serão salvos no Storage pois os buckets não foram configurados. A análise funcionará normalmente.');
      }
    }
    verify();
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      setFiles((prev) => [...prev, ...acceptedFiles]);
    },
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalise = async () => {
    console.log("Iniciando análise");
    if (!connectionStatus?.ok) {
      console.error("Falha na conexão com Supabase");
      setError(connectionStatus?.message || 'Erro de conexão com o banco.');
      return;
    }
    if (!colaborador || !avaliador || files.length === 0) {
      console.warn("Validação falhou: campos obrigatórios ou arquivos ausentes");
      setError('Por favor, preencha os campos obrigatórios e anexe pelo menos um arquivo.');
      return;
    }

    console.log("Arquivos selecionados:", files.map(f => f.name));
    setLoading(true);
    setError(null);
    setStorageWarning(null);

    try {
      console.log("Extraindo texto...");
      // 1. Extract text from all files
      const fileData = await Promise.all(
        files.map(async (f) => ({
          nome: f.name,
          conteudo: await extractTextFromFile(f),
        }))
      );

      console.log("Enviando para IA...");
      // 2. Call backend for AI Analysis
      const response = await fetch('/api/analisar-monitoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          colaborador,
          avaliador,
          observacoes,
          arquivos: fileData,
        }),
      });

      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(
          'A rota /api/analisar-monitoria não retornou JSON. Resposta do servidor: ' + text.slice(0, 200)
        );
      }

      const analise = await response.json();

      if (!response.ok) {
        const errorMessage = analise.error || analise.message || 'Falha na análise da IA';
        
        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('invalid API key')) {
          throw new Error('A Chave API do OpenRouter é inválida. Por favor, verifique as configurações no OpenRouter.');
        }
        if (errorMessage.includes('not configured') || errorMessage.includes('não configurada')) {
          throw new Error('A Chave API do OpenRouter não foi encontrada. Configure OPENROUTER_API_KEY no painel de Segredos/Variáveis.');
        }
        
        throw new Error(errorMessage);
      }
      console.log("Análise concluída");

      // 3. Save to Supabase (Monitoria)
      const { data: monitoria, error: dbError } = await supabase
        .from('monitorias')
        .insert({
          tipo_atendimento: tipo,
          colaborador,
          avaliador,
          mes_referencia: mes,
          numero_monitoria_mes: numeroMonitoria,
          quantidade_arquivos: files.length,
          nota_ia: analise.nota_ia,
          nota_final: analise.nota_final,
          classificacao_ia: analise.classificacao_ia,
          resumo_geral: analise.resumo_geral,
          pontos_fortes: analise.pontos_fortes,
          pontos_melhoria: analise.pontos_melhoria,
          falhas_criticas: analise.falhas_criticas,
          impacto_falhas: analise.impacto_falhas,
          feedback_colaborador: analise.feedback_colaborador,
          plano_acao: analise.plano_acao,
          orientacao_treinamento: analise.orientacao_treinamento,
          resumo_analise_cruzada: analise.resumo_analise_cruzada,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // 4. Save criteria
      const criteriosToInsert = analise.criterios.map((c: any) => ({
        monitoria_id: monitoria.id,
        ...c,
        status_final: c.status_ia,
        pontuacao_final: c.pontuacao_ia,
      }));

      const { error: critError } = await supabase
        .from('monitoria_criterios')
        .insert(criteriosToInsert);

      if (critError) throw critError;

      // 5. Upload files to Storage & Save to DB
      console.log("Tentando upload no Supabase Storage...");
      let someUploadFailed = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${monitoria.id}/${Date.now()}_${file.name}`;
        
        try {
          const { error: uploadError } = await supabase.storage
            .from('monitoria-arquivos')
            .upload(fileName, file);

          if (uploadError) {
            console.log("Upload falhou, continuando análise sem salvar arquivo");
            someUploadFailed = true;
          }

          const { data: publicUrl } = supabase.storage
            .from('monitoria-arquivos')
            .getPublicUrl(fileName);

          await supabase.from('arquivos_monitoria').insert({
            monitoria_id: monitoria.id,
            nome_arquivo: file.name,
            tipo_arquivo: file.type,
            url_arquivo: publicUrl.publicUrl,
            storage_path: fileName,
            transcricao_texto: fileData[i].conteudo,
          });
        } catch (e) {
          console.warn("Erro ao processar arquivo no storage:", e);
          someUploadFailed = true;
        }
      }

      if (someUploadFailed || connectionStatus?.bucketsOk === false) {
        alert("A análise foi concluída, mas os arquivos não foram salvos no Storage porque o bucket monitoria-arquivos não foi encontrado ou houve um erro de permissão.");
      }

      // 6. Final Sync
      await supabase.from('monitorias').update({
        arquivo_nome: files[0]?.name,
        arquivo_url: files.length > 0 ? (supabase.storage.from('monitoria-arquivos').getPublicUrl(`${monitoria.id}/${files[0].name}`).data.publicUrl) : null
      }).eq('id', monitoria.id);

      // Navigate to details
      navigate(`/admin/monitoria/${monitoria.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {connectionStatus?.ok && (
        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center gap-2 text-emerald-700 text-xs font-bold">
          <ShieldCheck size={14} />
          Conectado ao Supabase
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0B1F3A]">Tipo de Atendimento</label>
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setTipo('SDR')}
                className={`flex-1 py-2 rounded-md font-bold transition-all ${
                  tipo === 'SDR' ? 'bg-[#102B52] text-white shadow-md' : 'text-gray-500'
                }`}
              >
                SDR
              </button>
              <button
                onClick={() => setTipo('Closer')}
                className={`flex-1 py-2 rounded-md font-bold transition-all ${
                  tipo === 'Closer' ? 'bg-[#102B52] text-white shadow-md' : 'text-gray-500'
                }`}
              >
                Closer
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0B1F3A]">Colaborador</label>
            <input
              type="text"
              placeholder="Nome do colaborador"
              value={colaborador}
              onChange={(e) => setColaborador(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#4DA8FF] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0B1F3A]">Avaliador</label>
            <input
              type="text"
              placeholder="Seu nome"
              value={avaliador}
              onChange={(e) => setAvaliador(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#4DA8FF] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0B1F3A]">Mês de Referência</label>
            <input
              type="text"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#4DA8FF] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#0B1F3A]">Nº da Monitoria no Mês</label>
            <select
              value={numeroMonitoria}
              onChange={(e) => setNumeroMonitoria(Number(e.target.value) as 1 | 2)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#4DA8FF] transition-all"
            >
              <option value={1}>1ª Monitoria</option>
              <option value={2}>2ª Monitoria</option>
            </select>
          </div>
        </div>

        <div className="space-y-2 mb-8">
          <label className="text-sm font-bold text-[#0B1F3A]">Observações (Opcional)</label>
          <textarea
            rows={3}
            placeholder="Alguma informação extra sobre o atendimento?"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#4DA8FF] transition-all"
          />
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold text-[#0B1F3A]">Anexar Atendimentos (WhatsApp, PDF, TXT...)</label>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
              isDragActive ? 'border-[#4DA8FF] bg-[#D9EEFF]/30' : 'border-gray-200 hover:border-[#4DA8FF]'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-[#D9EEFF] text-[#102B52] rounded-full flex items-center justify-center">
                <Upload size={24} />
              </div>
              <p className="text-gray-600 font-medium">
                {isDragActive ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
              </p>
              <p className="text-gray-400 text-xs text-center">
                Aceita múltiplos arquivos. A IA cruzará as informações para gerar uma nota única.
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-3 truncate">
                    <FileText size={18} className="text-[#102B52]" />
                    <span className="text-sm text-gray-700 truncate">{file.name}</span>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {storageWarning && (
          <div className="mt-8 bg-amber-50 border-l-4 border-amber-500 p-4 flex items-center gap-3 text-amber-700">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">{storageWarning}</p>
          </div>
        )}

        {error && (
          <div className="mt-8 bg-red-50 border-l-4 border-red-500 p-4 flex items-center gap-3 text-red-700">
            <AlertCircle size={20} />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="mt-10 flex justify-end">
          <button
            onClick={handleAnalise}
            disabled={loading}
            className="bg-[#102B52] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#4DA8FF] transition-all shadow-lg flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Analisando com IA...
              </>
            ) : (
              <>
                <Send size={20} />
                Analisar Atendimento
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="bg-[#D9EEFF] rounded-2xl p-6 border border-[#4DA8FF]/20">
        <h3 className="text-[#0B1F3A] font-bold mb-2 flex items-center gap-2">
          <CheckCircle2 size={18} />
          Como funciona?
        </h3>
        <p className="text-[#0B1F3A]/70 text-sm leading-relaxed">
          Nossa IA avançada processa transcrições de áudio, conversas de WhatsApp e documentos para avaliar o desempenho do colaborador 
          com base nos roteiros oficiais da <strong>Lagoa Experience</strong>. A nota final é calculada considerando pesos reais de cada 
          critério, garantindo uma avaliação técnica, justa e assertiva.
        </p>
      </div>
    </div>
  );
}
