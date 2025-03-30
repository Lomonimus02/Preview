import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export function SystemStatus() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-lg font-heading font-semibold text-gray-800 mb-4">Системная информация</h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">CPU</span>
            <span className="text-sm font-medium text-gray-700">24%</span>
          </div>
          <Progress value={24} className="h-2" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Память</span>
            <span className="text-sm font-medium text-gray-700">42%</span>
          </div>
          <Progress value={42} className="h-2" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Диск</span>
            <span className="text-sm font-medium text-gray-700">68%</span>
          </div>
          <Progress value={68} className="h-2" />
        </div>
        <div className="pt-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Последнее резервное копирование</span>
            <Badge variant="outline" className="bg-primary-50 text-primary-dark border-0">
              Сегодня 08:45
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
