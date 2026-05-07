import { useState } from 'react';
import { useAuth } from '../App';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { LogIn, ShieldAlert, ArrowLeft } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(username, password)) {
      navigate('/admin/dashboard');
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="bg-[#102B52] p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <img 
            src="https://i.postimg.cc/1RjH4j0M/logo-lagoa.png" 
            alt="Logo" 
            className="h-20 mx-auto mb-6"
          />
          <h1 className="text-white text-3xl font-black tracking-tight">Portal Administrador</h1>
          <p className="text-[#4DA8FF] text-xs font-black uppercase tracking-[0.2em] mt-3 opacity-80">Gestão e Auditoria de Monitorias</p>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8">
          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-red-50 border-l-4 border-red-500 p-5 flex items-center gap-4 rounded-r-xl"
            >
              <ShieldAlert className="text-red-500 shrink-0" size={24} />
              <p className="text-red-700 text-sm font-bold">Credenciais administrativas inválidas. Verifique seu acesso.</p>
            </motion.div>
          )}

          <div className="space-y-3">
            <label className="text-xs font-black text-[#0B1F3A] uppercase tracking-widest ml-1">Usuário de Acesso</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-[#4DA8FF]/20 focus:border-[#4DA8FF] outline-none transition-all font-medium text-[#0B1F3A]"
              placeholder="Ex: Administrador"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-[#0B1F3A] uppercase tracking-widest ml-1">Senha Corporativa</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-[#4DA8FF]/20 focus:border-[#4DA8FF] outline-none transition-all font-medium"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#102B52] text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-[#4DA8FF] transition-all shadow-xl shadow-[#102B52]/20 flex items-center justify-center gap-3 transform active:scale-[0.98]"
          >
            <LogIn size={20} />
            Autenticar no Painel
          </button>
        </form>

        <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
          <button 
            type="button"
            onClick={() => navigate('/')}
            className="text-sm font-bold text-gray-400 hover:text-[#102B52] transition-colors flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-xl hover:bg-white"
          >
            <ArrowLeft size={16} />
            Voltar para o Portal da IA
          </button>
        </div>
      </motion.div>
    </div>
  );
}
