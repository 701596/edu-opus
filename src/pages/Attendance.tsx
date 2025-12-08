/**
 * Teacher Attendance Page
 * 
 * Mobile-first attendance marking UI for teachers.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Calendar as CalendarIcon, Check, X, Clock, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRole } from '@/contexts/RoleContext';
import { format, addDays, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// =============================================
// Types
// =============================================

interface ClassInfo {
    id: string;
    name: string;
    grade: string;
    student_count?: number;
}

interface StudentAttendance {
    student_id: string;
    student_name: string;
    status: 'present' | 'absent' | 'late' | 'excused' | 'unmarked';
    notes?: string;
}

// =============================================
// Component
// =============================================

export default function Attendance() {
    const { currentSchool, isTeacher, isPrincipal } = useRole();
    const { toast } = useToast();

    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch teacher's classes
    useEffect(() => {
        async function fetchClasses() {
            if (!currentSchool) return;

            // Use any cast since classes table not in generated types yet
            const { data, error } = await (supabase as any)
                .from('classes')
                .select('id, name, grade')
                .eq('school_id', currentSchool.school_id)
                .eq('is_active', true)
                .order('name');

            if (error) {
                console.error('Failed to fetch classes:', error);
            } else {
                setClasses(data || []);
                if (data && data.length > 0 && !selectedClass) {
                    setSelectedClass(data[0].id);
                }
            }
            setIsLoading(false);
        }

        fetchClasses();
    }, [currentSchool]);

    // Fetch attendance for selected class and date
    useEffect(() => {
        async function fetchAttendance() {
            if (!selectedClass || !selectedDate) return;

            setIsLoading(true);
            const { data, error } = await supabase.rpc('get_class_attendance' as any, {
                p_class_id: selectedClass,
                p_date: format(selectedDate, 'yyyy-MM-dd'),
            });

            if (error) {
                console.error('Failed to fetch attendance:', error);
                setStudents([]);
            } else {
                setStudents(data || []);
            }
            setIsLoading(false);
            setHasChanges(false);
        }

        fetchAttendance();
    }, [selectedClass, selectedDate]);

    // Mark attendance for a student
    const markAttendance = (studentId: string, status: StudentAttendance['status']) => {
        setStudents(prev => prev.map(s =>
            s.student_id === studentId ? { ...s, status } : s
        ));
        setHasChanges(true);
    };

    // Mark all students
    const markAll = (status: 'present' | 'absent') => {
        setStudents(prev => prev.map(s => ({ ...s, status })));
        setHasChanges(true);
    };

    // Save attendance
    const saveAttendance = async () => {
        if (!selectedClass) return;

        setIsSaving(true);
        try {
            const attendance = students
                .filter(s => s.status !== 'unmarked')
                .map(s => ({
                    student_id: s.student_id,
                    status: s.status,
                    notes: s.notes || null,
                }));

            const { error } = await supabase.rpc('mark_attendance_bulk' as any, {
                p_class_id: selectedClass,
                p_date: format(selectedDate, 'yyyy-MM-dd'),
                p_attendance: attendance,
            });

            if (error) throw error;

            toast({
                title: 'Attendance Saved',
                description: `Marked ${attendance.length} students for ${format(selectedDate, 'MMM d, yyyy')}`,
            });
            setHasChanges(false);
        } catch (error: any) {
            toast({
                title: 'Save Failed',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Stats
    const stats = {
        present: students.filter(s => s.status === 'present').length,
        absent: students.filter(s => s.status === 'absent').length,
        late: students.filter(s => s.status === 'late').length,
        unmarked: students.filter(s => s.status === 'unmarked').length,
    };

    return (
        <div className="container mx-auto py-6 px-4 max-w-2xl">
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Attendance</h1>
                    {hasChanges && (
                        <Button onClick={saveAttendance} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save
                        </Button>
                    )}
                </div>

                {/* Class & Date Selection */}
                <div className="grid grid-cols-2 gap-4">
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Class" />
                        </SelectTrigger>
                        <SelectContent>
                            {classes.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.name} {c.grade && `(${c.grade})`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="flex-1">
                                    <CalendarIcon className="h-4 w-4 mr-2" />
                                    {format(selectedDate, 'MMM d')}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={(d) => d && setSelectedDate(d)}
                                />
                            </PopoverContent>
                        </Popover>
                        <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => markAll('present')} className="flex-1">
                        <Check className="h-4 w-4 mr-1" /> All Present
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => markAll('absent')} className="flex-1">
                        <X className="h-4 w-4 mr-1" /> All Absent
                    </Button>
                </div>

                {/* Stats Bar */}
                <div className="flex gap-2 text-sm">
                    <Badge variant="default" className="bg-green-500">
                        Present: {stats.present}
                    </Badge>
                    <Badge variant="destructive">
                        Absent: {stats.absent}
                    </Badge>
                    <Badge variant="secondary">
                        Late: {stats.late}
                    </Badge>
                    {stats.unmarked > 0 && (
                        <Badge variant="outline">
                            Unmarked: {stats.unmarked}
                        </Badge>
                    )}
                </div>

                {/* Student List */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : students.length === 0 ? (
                    <Alert>
                        <AlertDescription>
                            No students enrolled in this class. Assign students first.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <div className="space-y-2">
                        {students.map((student) => (
                            <Card key={student.student_id} className={cn(
                                "transition-colors",
                                student.status === 'present' && "border-green-500 bg-green-50 dark:bg-green-950",
                                student.status === 'absent' && "border-red-500 bg-red-50 dark:bg-red-950",
                                student.status === 'late' && "border-yellow-500 bg-yellow-50 dark:bg-yellow-950",
                            )}>
                                <CardContent className="flex items-center justify-between p-4">
                                    <span className="font-medium">{student.student_name}</span>
                                    <div className="flex gap-1">
                                        <Button
                                            size="sm"
                                            variant={student.status === 'present' ? 'default' : 'outline'}
                                            className={cn(
                                                student.status === 'present' && "bg-green-600 hover:bg-green-700"
                                            )}
                                            onClick={() => markAttendance(student.student_id, 'present')}
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={student.status === 'absent' ? 'destructive' : 'outline'}
                                            onClick={() => markAttendance(student.student_id, 'absent')}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={student.status === 'late' ? 'secondary' : 'outline'}
                                            onClick={() => markAttendance(student.student_id, 'late')}
                                        >
                                            <Clock className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
