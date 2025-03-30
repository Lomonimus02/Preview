import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { UserRoleEnum } from '@shared/schema';

type UserRole = {
  id: number;
  userId: number;
  role: UserRoleEnum;
  schoolId: number | null;
};

type School = {
  id: number;
  name: string;
  address: string;
  city: string;
  status: string;
};

interface UserRolesManagerProps {
  userId: number;
}

const UserRolesManager: React.FC<UserRolesManagerProps> = ({ userId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<UserRoleEnum | ''>('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);

  // Fetch user roles
  const { data: userRoles = [], isLoading: isLoadingRoles } = useQuery<UserRole[]>({
    queryKey: [`/api/user-roles/${userId}`],
  });

  // Fetch schools (for school-specific roles)
  const { data: schools = [], isLoading: isLoadingSchools } = useQuery<School[]>({
    queryKey: ['/api/schools'],
  });

  // Add role mutation
  const addRoleMutation = useMutation({
    mutationFn: async (data: { userId: number; role: UserRoleEnum; schoolId: number | null }) => {
      const res = await apiRequest('POST', '/api/user-roles', data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Не удалось добавить роль');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/user-roles/${userId}`] });
      toast({
        title: 'Роль добавлена',
        description: 'Роль пользователя успешно добавлена',
      });
      setIsAddDialogOpen(false);
      setNewRole('');
      setSelectedSchoolId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remove role mutation
  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      const res = await apiRequest('DELETE', `/api/user-roles/${roleId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Не удалось удалить роль');
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/user-roles/${userId}`] });
      toast({
        title: 'Роль удалена',
        description: 'Роль пользователя успешно удалена',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle adding a new role
  const handleAddRole = () => {
    if (!newRole) {
      toast({
        title: 'Ошибка',
        description: 'Выберите роль',
        variant: 'destructive',
      });
      return;
    }

    // Check if school is required for this role
    const isSchoolRole = [
      UserRoleEnum.SCHOOL_ADMIN,
      UserRoleEnum.TEACHER,
      UserRoleEnum.PRINCIPAL,
      UserRoleEnum.VICE_PRINCIPAL,
    ].includes(newRole as UserRoleEnum);

    if (isSchoolRole && !selectedSchoolId) {
      toast({
        title: 'Ошибка',
        description: 'Для этой роли необходимо выбрать школу',
        variant: 'destructive',
      });
      return;
    }

    addRoleMutation.mutate({
      userId,
      role: newRole as UserRoleEnum,
      schoolId: isSchoolRole ? selectedSchoolId : null,
    });
  };

  // Handle removing a role
  const handleRemoveRole = (roleId: number) => {
    if (confirm('Вы уверены, что хотите удалить эту роль?')) {
      removeRoleMutation.mutate(roleId);
    }
  };

  // Get role label
  const getRoleLabel = (role: UserRoleEnum) => {
    const roleLabels: Record<UserRoleEnum, string> = {
      [UserRoleEnum.SUPER_ADMIN]: 'Суперадминистратор',
      [UserRoleEnum.SCHOOL_ADMIN]: 'Администратор школы',
      [UserRoleEnum.TEACHER]: 'Учитель',
      [UserRoleEnum.STUDENT]: 'Ученик',
      [UserRoleEnum.PARENT]: 'Родитель',
      [UserRoleEnum.PRINCIPAL]: 'Директор',
      [UserRoleEnum.VICE_PRINCIPAL]: 'Завуч',
    };
    return roleLabels[role] || role;
  };

  // Get role badge variant
  const getRoleBadgeVariant = (role: UserRoleEnum) => {
    const roleBadgeVariants: Record<UserRoleEnum, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      [UserRoleEnum.SUPER_ADMIN]: 'destructive',
      [UserRoleEnum.SCHOOL_ADMIN]: 'destructive',
      [UserRoleEnum.TEACHER]: 'default',
      [UserRoleEnum.STUDENT]: 'secondary',
      [UserRoleEnum.PARENT]: 'secondary',
      [UserRoleEnum.PRINCIPAL]: 'default',
      [UserRoleEnum.VICE_PRINCIPAL]: 'default',
    };
    return roleBadgeVariants[role] || 'default';
  };

  // Check if a role requires a school
  const doesRoleRequireSchool = (role: UserRoleEnum) => {
    return [
      UserRoleEnum.SCHOOL_ADMIN,
      UserRoleEnum.TEACHER,
      UserRoleEnum.PRINCIPAL,
      UserRoleEnum.VICE_PRINCIPAL,
    ].includes(role);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Роли пользователя</CardTitle>
          <CardDescription>Управление ролями и разрешениями пользователя</CardDescription>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Добавить роль
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Добавить новую роль</DialogTitle>
              <DialogDescription>
                Выберите роль, которую хотите добавить пользователю.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="role">Роль</Label>
                <Select
                  value={newRole}
                  onValueChange={(value) => {
                    setNewRole(value as UserRoleEnum);
                    // Reset school selection if role doesn't require it
                    if (!doesRoleRequireSchool(value as UserRoleEnum)) {
                      setSelectedSchoolId(null);
                    }
                  }}
                >
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UserRoleEnum.SUPER_ADMIN}>Суперадминистратор</SelectItem>
                    <SelectItem value={UserRoleEnum.SCHOOL_ADMIN}>Администратор школы</SelectItem>
                    <SelectItem value={UserRoleEnum.TEACHER}>Учитель</SelectItem>
                    <SelectItem value={UserRoleEnum.STUDENT}>Ученик</SelectItem>
                    <SelectItem value={UserRoleEnum.PARENT}>Родитель</SelectItem>
                    <SelectItem value={UserRoleEnum.PRINCIPAL}>Директор</SelectItem>
                    <SelectItem value={UserRoleEnum.VICE_PRINCIPAL}>Завуч</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show school selection for roles that require it */}
              {newRole && doesRoleRequireSchool(newRole as UserRoleEnum) && (
                <div className="grid gap-2">
                  <Label htmlFor="school">Школа</Label>
                  <Select
                    value={selectedSchoolId?.toString() || ''}
                    onValueChange={(value) => setSelectedSchoolId(parseInt(value))}
                  >
                    <SelectTrigger id="school">
                      <SelectValue placeholder="Выберите школу" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.map((school) => (
                        <SelectItem key={school.id} value={school.id.toString()}>
                          {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleAddRole} disabled={addRoleMutation.isPending}>
                {addRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Добавить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoadingRoles ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : userRoles.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            У пользователя нет дополнительных ролей
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Роль</TableHead>
                <TableHead>Школа</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userRoles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(role.role)}>
                      {getRoleLabel(role.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {role.schoolId ? (
                      schools.find((s) => s.id === role.schoolId)?.name || `Школа ID: ${role.schoolId}`
                    ) : (
                      <span className="text-muted-foreground">Нет привязки к школе</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveRole(role.id)}
                      disabled={removeRoleMutation.isPending}
                    >
                      {removeRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default UserRolesManager;