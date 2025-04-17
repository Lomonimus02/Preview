import { useState, ReactNode, useEffect } from "react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

interface MainLayoutProps {
  children: ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps) {
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
    <div className="w-full flex flex-col h-screen bg-gray-50 overflow-hidden">
      <Header toggleSidebar={toggleSidebar} />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} />
        
        {/* Main Content */}
        <main 
          className={`flex-1 bg-gray-50 p-4 transition-all duration-300
            ${!sidebarOpen ? 'md:w-full' : ''} 
            ${className || 'overflow-auto'}`}
        >
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
