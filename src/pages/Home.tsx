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
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
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

  const addLog = (message: string) => {
    setAnalysisLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
    console.log(`[Análise] ${message}`);
  };

  const handleAnalise = async () => {
    if (!colaborador || !avaliador || files.length === 0) {
      setError('Por favor, preencha os campos obrigatórios e anexe pelo menos um arquivo.');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisLogs([]);
    setCurrentStep(1);

    try {
      // 1. Validando campos
      addLog('Validando campos obrigatórios...');
      if (!tipo || !colaborador || !avaliador) throw new Error('Campos obrigatórios ausentes.');
      
      // 2. Lendo arquivos e extraindo texto
      setCurrentStep(2);
      addLog(`Lendo ${files.length} arquivo(s)...`);
      const fileData = await Promise.all(
        files.map(async (f) => {
          addLog(`Extraindo texto de: ${f.name}`);
          const text = await extractTextFromFile(f);
          addLog(`Texto extraído (${text.length} caracteres) de: ${f.name}`);
          return { nome: f.name, conteudo: text };
        })
      );

      // 3. Preparando prompt e enviando para IA
      setCurrentStep(3);
      addLog('Enviando dados para processamento da IA (OpenRouter)...');
      addLog('Aguardando resposta da IA (pode levar até 60 segundos)...');

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
        const rawText = await response.text();
        throw new Error('A IA não retornou um formato válido. Resposta: ' + rawText.slice(0, 200));
      }

      const analise = await response.json();
      if (!response.ok) throw new Error(analise.error || 'Erro na análise da IA');

      // 4. Recebendo e interpretando JSON
      setCurrentStep(4);
      addLog('Resposta recebida e processada com sucesso.');
      addLog(`Nota IA: ${analise.nota_ia}% | Classificação: ${analise.classificacao}`);

      // 5. Salvando no Supabase
      setCurrentStep(5);
      addLog('Salvando registro da monitoria no banco de dados...');
      
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
          classificacao_ia: analise.classificacao,
          classificacao_final: analise.classificacao,
          classificacao: analise.classificacao,
          resumo_geral: analise.resumo_geral,
          pontos_fortes: analise.pontos_fortes,
          pontos_melhoria: analise.pontos_melhoria,
          falhas_criticas: analise.falhas_criticas,
          impacto_falhas: analise.impacto_falhas,
          feedback_colaborador: analise.feedback_colaborador,
          plano_acao: analise.plano_acao,
          orientacao_treinamento: analise.orientacao_treinamento,
        })
        .select()
        .single();

      if (dbError) throw new Error('Erro ao salvar monitoria: ' + dbError.message);

      // 6. Salvando critérios
      addLog('Salvando critérios detalhados...');
      const criteriosToInsert = analise.criterios.map((c: any) => ({
        monitoria_id: monitoria.id,
        codigo: c.codigo || '',
        criterio: c.criterio || '',
        item_avaliado: c.item_avaliado || '',
        peso: Number(c.peso || 0),
        pontuacao_ia: Number(c.pontuacao_ia || 0),
        status_ia: c.status_ia || 'NÃO',
        comentario_ia: c.comentario_ia || '',
        status_final: c.status_ia || 'NÃO',
        pontuacao_final: Number(c.pontuacao_ia || 0),
        fonte_evidencia: c.fonte_evidencia || 'Não identificado',
        orientacao_correcao: c.orientacao_correcao || '',
        observacao_admin: '',
        perda_pontos: Number(c.peso || 0) - Number(c.pontuacao_ia || 0),
        ajustado_manualmente: false
      }));

      const { error: critError } = await supabase.from('monitoria_criterios').insert(criteriosToInsert);
      
      if (critError) {
        if (critError.message.includes('schema cache')) {
          throw new Error('O banco foi atualizado, mas o Supabase ainda não recarregou o schema. Por favor, aguarde 30 segundos e tente analisar novamente.');
        }
        throw new Error('Erro ao salvar critérios: ' + critError.message);
      }

      // 7. Salvando arquivos no Storage (Opcional)
      setCurrentStep(6);
      addLog('Tentando salvar arquivos no Storage (Opcional)...');
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storagePath = `${monitoria.id}/${Date.now()}_${file.name}`;
        
        try {
          const { error: uploadError } = await supabase.storage.from('monitoria-arquivos').upload(storagePath, file);
          if (!uploadError) {
            const { data: pub } = supabase.storage.from('monitoria-arquivos').getPublicUrl(storagePath);
            await supabase.from('arquivos_monitoria').insert({
              monitoria_id: monitoria.id,
              nome_arquivo: file.name,
              tipo_arquivo: file.type,
              url_arquivo: pub.publicUrl,
              storage_path: storagePath,
              transcricao_texto: fileData[i].conteudo,
            });
          }
        } catch (e) {
          addLog(`Aviso: Falha ao salvar arquivo ${file.name} no Storage.`);
        }
      }

      addLog('Processo finalizado com sucesso!');
      setTimeout(() => navigate(`/admin/monitoria/${monitoria.id}`), 1000);

    } catch (err: any) {
      addLog(`Erro: ${err.message}`);
      setError(`Erro na etapa ${currentStep}: ${err.message}`);
      setCurrentStep(-1);
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

        {loading || currentStep !== 0 ? (
          <div className="mt-8 bg-[#0B1F3A] rounded-xl p-6 text-white overflow-hidden">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-[#4DA8FF]">
              <Loader2 className={currentStep > 0 && currentStep < 6 ? "animate-spin" : ""} size={16} />
              Status da Análise
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span>Progresso Geral</span>
                <span>{currentStep === -1 ? 'ERRO' : currentStep === 6 ? '100%' : `${Math.round((currentStep / 6) * 100)}%`}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${currentStep === -1 ? 'bg-red-500 w-full' : 'bg-[#4DA8FF]'}`}
                  style={{ width: currentStep === -1 ? '100%' : `${(currentStep / 6) * 100}%` }}
                />
              </div>
              
              <div className="bg-black/20 rounded-lg p-4 font-mono text-[10px] space-y-1 max-h-40 overflow-y-auto">
                {analysisLogs.map((log, i) => (
                  <div key={i} className={log.includes('Erro') ? 'text-red-400' : 'text-gray-300'}>
                    {log}
                  </div>
                ))}
                {loading && <div className="text-[#4DA8FF] animate-pulse">_</div>}
              </div>
            </div>

            {currentStep === -1 && (
              <div className="mt-4 flex gap-3">
                <button 
                  onClick={handleAnalise}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
                >
                  Tentar Novamente
                </button>
                <button 
                  onClick={() => { setFiles([]); setError(null); setCurrentStep(0); setAnalysisLogs([]); }}
                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
                >
                  Limpar e trocar arquivos
                </button>
              </div>
            )}
          </div>
        ) : null}

        {error && !loading && currentStep === 0 && (
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
