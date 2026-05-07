import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  History, 
  ArrowLeft, 
  LogOut, 
  Settings,
  CircleUser
} from 'lucide-react';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Histórico', path: '/admin/historico', icon: History },
  ];

  return (
    <div className="flex h-screen bg-[#F5F8FC]">
      {/* Sidebar */}
      <aside className="w-72 bg-[#0B1F3A] text-white flex flex-col shadow-2xl relative z-50">
        <div className="p-8 border-b border-white/5">
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <img 
              src="https://i.postimg.cc/1RjH4j0M/logo-lagoa.png" 
              alt="Lagoa Experience" 
              className="h-10 w-auto"
            />
            <div className="leading-tight">
              <span className="font-black text-lg tracking-tighter block">LAGOA</span>
              <span className="text-[10px] text-[#4DA8FF] font-black uppercase tracking-widest">Administrador</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 mt-8 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-5 py-4 rounded-xl transition-all group ${
                  isActive 
                    ? 'bg-[#4DA8FF] text-white shadow-lg font-bold' 
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={22} className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-[#4DA8FF] transition-colors'} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-4 pb-8 space-y-3">
          <Link
            to="/"
            className="flex items-center gap-3 px-5 py-4 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all font-medium border border-white/5 hover:border-white/10"
          >
            <ArrowLeft size={18} />
            Voltar para a IA
          </Link>

          <div className="p-5 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#102B52] border border-white/10 flex items-center justify-center">
                <CircleUser size={20} className="text-[#4DA8FF]" />
              </div>
              <div className="truncate">
                <p className="text-sm font-bold truncate">{user}</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Nível Admin</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-red-400 bg-red-400/5 hover:bg-red-400/10 transition-all font-bold text-xs uppercase tracking-widest"
            >
              <LogOut size={14} />
              Finalizar Sessão
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <header className="bg-white/80 backdrop-blur-md h-20 border-b border-gray-200 flex items-center justify-between px-10 sticky top-0 z-40">
          <div>
            <h2 className="text-2xl font-black text-[#0B1F3A] tracking-tight">
              {location.pathname.includes('dashboard') ? 'Dashboard de Performance' : 
               location.pathname.includes('historico') ? 'Histórico de Monitorias' : 
               'Detalhes da Análise'}
            </h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Portal Administrador Lagoa Experience</p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex flex-col items-end mr-2">
                <span className="text-[10px] font-black text-[#0B1F3A] uppercase tracking-widest opacity-40">Sistema</span>
                <span className="text-xs font-bold text-emerald-500 rounded-full bg-emerald-500/10 px-3 py-1 border border-emerald-500/20">OPERACIONAL</span>
             </div>
             <Settings className="text-gray-300 hover:text-[#0B1F3A] transition-colors cursor-pointer" size={20} />
          </div>
        </header>

        <div className="p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
