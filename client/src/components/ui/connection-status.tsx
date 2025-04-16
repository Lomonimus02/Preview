import { useState, useEffect } from 'react';
import { Shield, ShieldAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface ConnectionStatusProps {
  className?: string;
}

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const [isSecure, setIsSecure] = useState<boolean>(window.location.protocol === 'https:');
  const [hostname, setHostname] = useState<string>(window.location.hostname);
  const [port, setPort] = useState<string>(window.location.port);

  useEffect(() => {
    // Обновление статуса при изменении протокола или хоста
    const checkConnection = () => {
      setIsSecure(window.location.protocol === 'https:');
      setHostname(window.location.hostname);
      setPort(window.location.port);
    };

    // Проверяем статус при монтировании и при изменении URL
    checkConnection();
    
    // Обработка события изменения хэша (для SPA приложений)
    window.addEventListener('hashchange', checkConnection);
    
    return () => {
      window.removeEventListener('hashchange', checkConnection);
    };
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center space-x-2 ${className}`}>
            {isSecure ? (
              <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 flex items-center gap-1 px-2 py-0.5">
                <Shield className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">HTTPS</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-50 border-yellow-200 text-yellow-700 flex items-center gap-1 px-2 py-0.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">HTTP</span>
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p>Соединение: <span className={isSecure ? "text-green-600 font-medium" : "text-yellow-600 font-medium"}>
              {isSecure ? "Защищенное (HTTPS)" : "Не защищенное (HTTP)"}
            </span></p>
            <p className="text-xs text-gray-500 mt-1">
              {hostname}{port ? `:${port}` : ''}
            </p>
            {!isSecure && (
              <p className="text-xs text-yellow-600 mt-1">
                Рекомендуется использовать HTTPS для повышения безопасности
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}