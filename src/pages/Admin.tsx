import { useState, useEffect } from 'react';
import { 
  Users, 
  Trophy, 
  AlertTriangle, 
  CheckCircle, 
  ArrowUpRight, 
  BarChart3,
  TrendingUp,
  Target,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';

export default function Admin() {
  const [stats, setStats] = useState({
    total: 0,
    mediaGeral: 0,
    mediaSDR: 0,
    mediaCloser: 0,
    excelentes: 0,
    criticas: 0,
    pendentesFeedback: 0,
    revisadas: 0,
    criterioFalha: 'N/A',
    pendenteSegunda: 0
  });
  const [ranking, setRanking] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();

    // Realtime subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: monitorias, error } = await supabase
        .from('monitorias')
        .select('*');

      if (error) throw error;

      if (monitorias) {
        const total = monitorias.length;
        const media = total > 0 ? monitorias.reduce((acc, m) => acc + (Number(m.nota_final) || Number(m.nota_ia) || 0), 0) / total : 0;
        
        const sdrs = monitorias.filter(m => m.tipo_atendimento === 'SDR');
        const closers = monitorias.filter(m => m.tipo_atendimento === 'Closer');
        
        const mediaSDR = sdrs.length > 0 ? sdrs.reduce((acc, m) => acc + (Number(m.nota_final) || Number(m.nota_ia) || 0), 0) / sdrs.length : 0;
        const mediaCloser = closers.length > 0 ? closers.reduce((acc, m) => acc + (Number(m.nota_final) || Number(m.nota_ia) || 0), 0) / closers.length : 0;

        const excelentes = monitorias.filter(m => (Number(m.nota_final) || Number(m.nota_ia)) >= 90).length;
        const criticas = monitorias.filter(m => (Number(m.nota_final) || Number(m.nota_ia)) < 70).length;
        const pendentes = monitorias.filter(m => m.status_feedback === 'Pendente').length;
        const revisadas = monitorias.filter(m => m.revisada_manualmente).length;

        // Fetch criteria to find most failed
        const { data: criteriaData } = await supabase.from('monitoria_criterios').select('item_avaliado, status_final, status_ia');
        let mostFailed = 'N/A';
        if (criteriaData) {
          const failures = new Map();
          criteriaData.forEach(c => {
            const status = c.status_final || c.status_ia;
            if (status === 'NÃO' || status === 'PARCIAL') {
              failures.set(c.item_avaliado, (failures.get(c.item_avaliado) || 0) + 1);
            }
          });
          if (failures.size > 0) {
            mostFailed = Array.from(failures.entries()).sort((a, b) => b[1] - a[1])[0][0];
          }
        }

        // Ranking por colaborador
        const colabMap = new Map();
        monitorias.forEach(m => {
          if (!colabMap.has(m.colaborador)) {
            colabMap.set(m.colaborador, { 
              nome: m.colaborador, 
              tipo: m.tipo_atendimento, 
              notas: [],
              pendentes: 0
            });
          }
          const c = colabMap.get(m.colaborador);
          c.notas.push(Number(m.nota_final) || Number(m.nota_ia) || 0);
          if (m.status_feedback === 'Pendente') c.pendentes++;
        });

        const rankingArray = Array.from(colabMap.values()).map(c => {
          const media = c.notas.reduce((a: number, b: number) => a + b, 0) / c.notas.length;
          return {
            ...c,
            media: Number(media.toFixed(1)),
            status: c.pendentes > 0 ? 'Pendente' : 'Completo',
            classificacao: media >= 90 ? 'Excelente' : media >= 80 ? 'Bom' : 'Crítico'
          };
        }).sort((a, b) => b.media - a.media);

        const pendenteSegunda = Array.from(colabMap.values()).filter(c => c.notas.length === 1).length;

        setStats({
          total,
          mediaGeral: Number(media.toFixed(1)),
          mediaSDR: Number(mediaSDR.toFixed(1)),
          mediaCloser: Number(mediaCloser.toFixed(1)),
          excelentes,
          criticas,
          pendentesFeedback: pendentes,
          revisadas,
          criterioFalha: mostFailed,
          pendenteSegunda
        });

        setRanking(rankingArray);

        // Chart Data
        const distribution = [
          { name: 'Excelente', value: excelentes, color: '#10B981' },
          { name: 'Bom', value: monitorias.filter(m => {
            const n = Number(m.nota_final) || Number(m.nota_ia);
            return n >= 80 && n < 90;
          }).length, color: '#3B82F6' },
          { name: 'Regular', value: monitorias.filter(m => {
            const n = Number(m.nota_final) || Number(m.nota_ia);
            return n >= 70 && n < 80;
          }).length, color: '#F59E0B' },
          { name: 'Crítico', value: criticas, color: '#EF4444' },
        ];
        setChartData(distribution);
      }
    } catch (err) {
      console.error('Error dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#102B52]"></div>
    </div>
  );

  return (
    <div className="space-y-10 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Monitorias" value={stats.total} icon={Users} color="bg-[#102B52]" trend="Analises Totais" />
        <StatCard title="Média Geral" value={`${stats.mediaGeral}%`} icon={BarChart3} color="bg-indigo-600" trend="Média IA + Humana" />
        <StatCard title="Excelentes" value={stats.excelentes} icon={Trophy} color="bg-emerald-500" trend="Score >= 90" />
        <StatCard title="Críticas" value={stats.criticas} icon={AlertTriangle} color="bg-red-500" trend="Score < 70" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Média SDR" value={`${stats.mediaSDR}%`} icon={TrendingUp} color="bg-blue-500" trend="Desempenho SDR" />
        <StatCard title="Média Closer" value={`${stats.mediaCloser}%`} icon={Target} color="bg-purple-500" trend="Desempenho Closer" />
        <StatCard title="Pend. Feedback" value={stats.pendentesFeedback} icon={MessageSquare} color="bg-amber-500" trend="Aguardando feedback" />
        <StatCard title="Revisadas" value={stats.revisadas} icon={CheckCircle} color="bg-teal-500" trend="Ajuste manual" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title="Pendentes de 2ª Monitoria" value={stats.pendenteSegunda} icon={ArrowUpRight} color="bg-orange-500" trend="Colaboradores com apenas 1 analise no mes" />
        <StatCard title="Critério com Maior Falha" value={stats.criterioFalha} icon={AlertCircle} color="bg-slate-700" trend="Gap principal da equipe" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-xl font-black text-[#0B1F3A]">Ranking por Colaborador</h3>
            <Target className="text-gray-300" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Média</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Classificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ranking.map((colab, i) => (
                  <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[#0B1F3A]">{colab.nome}</span>
                        <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{colab.tipo}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center font-black text-[#0B1F3A]">{colab.media}%</td>
                    <td className="px-6 py-5 text-center leading-none">
                      <span className={`text-[10px] font-black ${colab.status === 'Completo' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {colab.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className={`text-[10px] font-black px-3 py-1.5 rounded-full border ${
                        colab.classificacao === 'Excelente' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' :
                        colab.classificacao === 'Bom' ? 'border-blue-100 bg-blue-50 text-blue-600' :
                        'border-red-100 bg-red-50 text-red-600'
                      }`}>
                        {colab.classificacao.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
           <h3 className="text-xl font-black text-[#0B1F3A] mb-8">Evolução Mensal</h3>
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                       {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <RechartsTooltip />
                 </PieChart>
              </ResponsiveContainer>
           </div>
           <div className="space-y-4 mt-8">
              {chartData.map((d, i) => (
                <div key={i} className="flex justify-between items-center text-xs font-bold">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></div>
                    <span className="text-gray-400 uppercase">{d.name}</span>
                  </div>
                  <span className="text-[#0B1F3A]">{d.value}</span>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${color} text-white`}>
          <Icon size={20} />
        </div>
        <ArrowUpRight size={16} className="text-gray-300" />
      </div>
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{title}</p>
      <p className="text-3xl font-black text-[#0B1F3A] mt-1">{value}</p>
      <p className="text-[10px] font-bold text-[#4DA8FF] mt-2 opacity-60 uppercase">{trend}</p>
    </div>
  );
}
