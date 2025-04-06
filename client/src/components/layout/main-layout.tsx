import { useState, ReactNode, useEffect } from "react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  // Проверка ширины экрана для определения мобильного режима
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  
  return (
    <div className="w-full flex flex-col h-screen bg-gray-50">
      <Header toggleSidebar={toggleSidebar} />
      
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} />
        
        {/* Кнопка сворачивания сайдбара для десктопа */}
        <div className="hidden md:block absolute left-0 top-2 z-50">
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-full bg-white shadow ${sidebarOpen ? 'ml-64' : 'ml-2'} transition-all duration-300`}
            onClick={toggleSidebar}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
        
        {/* Main Content */}
        <main 
          className={`flex-1 overflow-y-auto bg-gray-50 p-4 pb-20 md:pb-4 transition-all duration-300 ${
            !sidebarOpen ? 'md:pl-6' : 'md:pl-4'
          }`}
        >
          {children}
        </main>
      </div>
      
      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
