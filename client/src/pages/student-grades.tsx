import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { UserRoleEnum, Grade, Subject, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CalendarIcon, BookOpenIcon, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export default function StudentGrades() {
  const { user } = useAuth();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "all">("all");
  const isStudent = user?.role === UserRoleEnum.STUDENT;
  const isParent = user?.role === UserRoleEnum.PARENT;
  
  // Для студента загружаем оценки
  const { data: grades = [], isLoading: isGradesLoading } = useQuery<Grade[]>({
    queryKey: ["/api/grades"],
    enabled: !!user && (isStudent || isParent)
  });
  
  // Загружаем предметы
  const { data: subjects = [], isLoading: isSubjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!user
  });
  
  // Для родителя загружаем связи с детьми
  const { data: children = [], isLoading: isChildrenLoading } = useQuery<User[]>({
    queryKey: ["/api/parent-children"],
    enabled: !!user && isParent
  });
  
  // Состояние для выбранного ребенка (для родителя)
  const [selectedChildId, setSelectedChildId] = useState<number | "all">("all");
  
  // Фильтруем оценки по выбранному предмету и ребенку
  const filteredGrades = grades.filter(grade => {
    // Фильтрация по предмету
    const subjectMatches = selectedSubjectId === "all" || grade.subjectId === selectedSubjectId;
    
    // Фильтрация по ребенку (только для родителя)
    const childMatches = isParent 
      ? (selectedChildId === "all" || grade.studentId === selectedChildId)
      : true;
    
    return subjectMatches && childMatches;
  });
  
  // Группируем оценки по предметам
  const gradesBySubject = new Map<number, Grade[]>();
  filteredGrades.forEach(grade => {
    if (!gradesBySubject.has(grade.subjectId)) {
      gradesBySubject.set(grade.subjectId, []);
    }
    gradesBySubject.get(grade.subjectId)?.push(grade);
  });
  
  // Расчет среднего балла по предмету
  const calculateAverageGrade = (subjectGrades: Grade[]) => {
    if (subjectGrades.length === 0) return "-";
    const sum = subjectGrades.reduce((total, g) => total + g.grade, 0);
    return (sum / subjectGrades.length).toFixed(1);
  };
  
  // Получение названия предмета
  const getSubjectName = (id: number) => {
    const subject = subjects.find(s => s.id === id);
    return subject ? subject.name : `Предмет ${id}`;
  };
  
  // Форматирование даты
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "dd.MM.yyyy", { locale: ru });
    } catch (e) {
      return dateString;
    }
  };
  
  // Проверяем загрузку данных
  const isLoading = isGradesLoading || isSubjectsLoading || (isParent && isChildrenLoading);
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <h3 className="text-lg font-medium">Загрузка данных...</h3>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  // Если пользователь не имеет доступа к странице
  if (!isStudent && !isParent) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Доступ запрещен</CardTitle>
              <CardDescription>
                У вас нет доступа к просмотру оценок. Только ученики и родители могут просматривать оценки.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              {isStudent ? "Мои оценки" : "Оценки детей"}
            </h1>
            <p className="text-gray-500">
              {isStudent ? "Список ваших оценок по предметам" : "Просмотр оценок ваших детей"}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            {isParent && children.length > 0 && (
              <Select
                value={selectedChildId.toString()}
                onValueChange={(value) => setSelectedChildId(value === "all" ? "all" : parseInt(value))}
              >
                <SelectTrigger className="w-[180px]">
                  <div className="flex items-center">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Выберите ребенка" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все дети</SelectItem>
                  {children.map((child) => (
                    <SelectItem key={child.id} value={child.id.toString()}>
                      {child.lastName} {child.firstName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Select
              value={selectedSubjectId.toString()}
              onValueChange={(value) => setSelectedSubjectId(value === "all" ? "all" : parseInt(value))}
            >
              <SelectTrigger className="w-[180px]">
                <div className="flex items-center">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Все предметы" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все предметы</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id.toString()}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {filteredGrades.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Нет оценок</CardTitle>
              <CardDescription>
                {isStudent 
                  ? "У вас пока нет оценок по выбранным предметам" 
                  : "У ваших детей пока нет оценок по выбранным предметам"}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Отображаем оценки сгруппированные по предметам */}
            {[...gradesBySubject.entries()].map(([subjectId, subjectGrades]) => (
              <Card key={subjectId}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center">
                    <BookOpenIcon className="h-5 w-5 mr-2" />
                    {getSubjectName(subjectId)}
                  </CardTitle>
                  <CardDescription>
                    Средний балл: <span className="font-bold">{calculateAverageGrade(subjectGrades)}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Дата</TableHead>
                          {isParent && <TableHead>Ученик</TableHead>}
                          <TableHead>Оценка</TableHead>
                          <TableHead>Тип</TableHead>
                          <TableHead>Комментарий</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subjectGrades.map((grade) => (
                          <TableRow key={grade.id}>
                            <TableCell>
                              {formatDate(grade.createdAt)}
                            </TableCell>
                            {isParent && (
                              <TableCell>
                                {children.find(c => c.id === grade.studentId)?.lastName || ""} {children.find(c => c.id === grade.studentId)?.firstName || ""}
                              </TableCell>
                            )}
                            <TableCell className="font-bold">
                              <span className={`px-2 py-1 rounded-full ${
                                grade.grade >= 4 ? 'bg-green-100 text-green-800' : 
                                grade.grade >= 3 ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-red-100 text-red-800'
                              }`}>
                                {grade.grade}
                              </span>
                            </TableCell>
                            <TableCell>{grade.gradeType || "Текущая"}</TableCell>
                            <TableCell>{grade.comment || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}