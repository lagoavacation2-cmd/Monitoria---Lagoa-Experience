import { Outlet, Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col">
      <header className="bg-[#0B1F3A] text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img 
              src="https://i.postimg.cc/1RjH4j0M/logo-lagoa.png" 
              alt="Lagoa Experience" 
              className="h-12 w-auto group-hover:scale-110 transition-transform"
            />
            <div>
              <h1 className="font-black text-xl tracking-tighter leading-none">LAGOA EXPERIENCE</h1>
              <p className="text-[10px] uppercase font-bold text-[#4DA8FF] tracking-[0.2em]">Monitoria de Inteligência Artificial</p>
            </div>
          </Link>

          <Link 
            to="/admin/login" 
            className="flex items-center gap-2 bg-[#102B52] border border-white/10 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#4DA8FF] hover:border-transparent transition-all shadow-lg active:scale-95"
          >
            <ShieldCheck size={18} />
            Portal Administrador
          </Link>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key="main-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="bg-white border-t border-gray-200 p-8 text-center mt-20">
        <p className="text-gray-400 text-sm font-medium">© 2026 LAGOA EXPERIENCE. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
