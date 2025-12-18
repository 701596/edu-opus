/**
 * Teacher Attendance Page
 * 
 * Mobile-first attendance marking UI for teachers.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Calendar as CalendarIcon, Check, X, Clock, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRole } from '@/contexts/RoleContext';
import { format, addDays, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export interface StudentAttendance {
    student_id: string;
    student_name: string;
    status: 'present' | 'absent' | 'late' | 'unmarked';
    notes?: string;
    rank?: number;
    attendance_percentage?: number;
}

export interface ClassInfo {
    id: string;
    name: string;
    grade?: string | null;
}

// Helper for sorting classes
const sortClasses = (a: any, b: any) => {
    const order = ['Nursery', 'L.K.G.', 'U.K.G.'];
    const getOrder = (name: string) => {
        const index = order.findIndex(o => name.includes(o));
        if (index !== -1) return index;
        if (name.includes('Grade')) {
            const num = parseInt(name.replace(/\D/g, ''));
            return 10 + (isNaN(num) ? 99 : num);
        }
        return 100; // Others last
    };

    return getOrder(a.name) - getOrder(b.name) || a.name.localeCompare(b.name);
};

// Optimized Card Component to prevent full list re-renders
const StudentAttendanceCard = ({ student, onMark }: { student: StudentAttendance, onMark: (id: string, status: StudentAttendance['status']) => void }) => {
    return (
        <Card className={cn(
            "transition-colors",
            student.status === 'present' && "border-green-500 bg-green-50 dark:bg-green-950",
            student.status === 'absent' && "border-red-500 bg-red-50 dark:bg-red-950",
            student.status === 'late' && "border-yellow-500 bg-yellow-50 dark:bg-yellow-950",
        )}>
            <CardContent className="flex items-center justify-between p-4">
                <div>
                    <span className="font-medium">{student.student_name}</span>
                </div>
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant={student.status === 'present' ? 'default' : 'outline'}
                        className={cn(
                            student.status === 'present' && "bg-green-600 hover:bg-green-700"
                        )}
                        onClick={() => onMark(student.student_id, 'present')}
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant={student.status === 'absent' ? 'destructive' : 'outline'}
                        onClick={() => onMark(student.student_id, 'absent')}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant={student.status === 'late' ? 'secondary' : 'outline'}
                        onClick={() => onMark(student.student_id, 'late')}
                    >
                        <Clock className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

// Memoize the component
// Only re-render if the student object (specifically status) changes
const MemoizedStudentCard = React.memo(StudentAttendanceCard, (prev, next) => {
    return prev.student.status === next.student.status && prev.student.student_id === next.student.student_id;
});

export default function Attendance() {
    const { currentSchool, isTeacher, isPrincipal, isLoading: roleLoading } = useRole();
    const { toast } = useToast();

    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Pagination State
    const [page, setPage] = useState(1);
    const [totalStudents, setTotalStudents] = useState(0);
    const pageSize = 100;

    // Analytics State
    const [analyticsData, setAnalyticsData] = useState<any[]>([]);
    const [rankingData, setRankingData] = useState<any[]>([]);

    // Fetch teacher's classes
    useEffect(() => {
        async function fetchClasses() {
            if (roleLoading) return;

            if (!currentSchool) {
                setIsLoading(false);
                return;
            }

            // Use any cast since classes table not in generated types yet
            const { data, error } = await (supabase as any)
                .from('classes')
                .select('id, name, grade')
                .eq('school_id', currentSchool.school_id)
                .eq('is_active', true)
                .order('name');

            if (error) {
                console.error('Failed to fetch classes:', error);
                toast({
                    title: "Error loading classes",
                    description: error.message,
                    variant: "destructive"
                });
            } else {
                const sortedClasses = (data || []).sort(sortClasses);
                setClasses(sortedClasses);
                if (sortedClasses.length > 0) {
                    // Only set default if we don't have one or if current selection is invalid
                    // For simplicity, always default to first class on load/switch
                    setSelectedClass(sortedClasses[0].id);
                }
            }
            setIsLoading(false);
        }

        fetchClasses();
    }, [currentSchool, roleLoading]);

    // Reset pagination when class changes
    useEffect(() => {
        setPage(1);
    }, [selectedClass]);

    // Fetch attendance for selected class and date
    useEffect(() => {
        async function fetchAttendance() {
            if (!selectedClass || !selectedDate) return;

            setIsLoading(true);
            try {
                // 1. Fetch Count
                const { data: countData } = await (supabase as any).rpc('get_class_student_count', {
                    p_class_id: selectedClass
                });
                setTotalStudents(Number(countData) || 0);

                // 2. Fetch Paginated Daily Status
                const { data: attendanceData, error: attError } = await (supabase as any).rpc('get_class_attendance_paginated', {
                    p_class_id: selectedClass,
                    p_date: format(selectedDate, 'yyyy-MM-dd'),
                    p_page: page,
                    p_limit: pageSize
                });

                if (attError) throw attError;
                setStudents((attendanceData as StudentAttendance[]) || []);

                // 3. Fetch Analytics (Summary) - Only fetch on page 1 for efficiency or separate effect? 
                // Currently keeping it here to ensure it's fresh.
                if (page === 1) {
                    const { data: summaryData } = await (supabase as any).rpc('get_class_attendance_summary', {
                        p_class_id: selectedClass
                    });
                    if (summaryData) setAnalyticsData(summaryData as any[]);

                    // 4. Fetch Ranking
                    const { data: rankData } = await (supabase as any).rpc('get_student_attendance_ranking', {
                        p_class_id: selectedClass
                    });
                    if (rankData) setRankingData(rankData as any[]);
                }

            } catch (error) {
                console.error('Failed to fetch attendance data:', error);
                setStudents([]);
            } finally {
                setIsLoading(false);
                setHasChanges(false);
            }
        }

        fetchAttendance();
    }, [selectedClass, selectedDate, page]);

    // Mark attendance for a student
    const markAttendance = useCallback((studentId: string, status: StudentAttendance['status']) => {
        setStudents(prev => prev.map(s =>
            s.student_id === studentId ? { ...s, status } : s
        ));
        setHasChanges(true);
    }, []);

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
                    <div className="space-y-6">
                        {/* Analytics Dashboard */}
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Attendance Overview Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Attendance Overview</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[200px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={analyticsData}>
                                                <XAxis dataKey="student_name" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={60} />
                                                <YAxis domain={[0, 100]} />
                                                <Tooltip />
                                                <Bar dataKey="attendance_percentage" fill="#16a34a" radius={[4, 4, 0, 0]} name="Attendance %" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                                        <div className="p-2 bg-muted rounded">
                                            <div className="text-xl font-bold text-green-600">
                                                {Math.round((stats.present / (students.length || 1)) * 100)}%
                                            </div>
                                            <div className="text-xs text-muted-foreground">Today's Presence</div>
                                        </div>
                                        <div className="p-2 bg-muted rounded">
                                            <div className="text-xl font-bold">
                                                {totalStudents}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Total Students</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Student Ranking & Roll Numbers */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Class Ranking</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px] overflow-y-auto pr-2">
                                        <table className="w-full text-sm">
                                            <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0">
                                                <tr>
                                                    <th className="p-2 text-left">Roll #</th>
                                                    <th className="p-2 text-left">Student</th>
                                                    <th className="p-2 text-right">Att. %</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rankingData.map((student) => (
                                                    <tr key={student.student_id} className="border-b last:border-0 hover:bg-muted/50">
                                                        <td className="p-2 font-mono font-bold text-primary">
                                                            #{student.rank}
                                                        </td>
                                                        <td className="p-2 font-medium">{student.student_name}</td>
                                                        <td className="p-2 text-right">
                                                            <Badge variant={student.attendance_percentage >= 75 ? 'default' : 'destructive'} className={cn(student.attendance_percentage >= 75 ? 'bg-green-500' : '')}>
                                                                {student.attendance_percentage}%
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-2">
                            {students.map((student) => (
                                <MemoizedStudentCard
                                    key={student.student_id}
                                    student={student}
                                    onMark={markAttendance}
                                />
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {totalStudents > pageSize && (
                            <div className="flex items-center justify-between mt-4 px-2">
                                <p className="text-sm text-muted-foreground">
                                    Page {page} of {Math.ceil(totalStudents / pageSize)}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                        disabled={page === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(prev => Math.min(Math.ceil(totalStudents / pageSize), prev + 1))}
                                        disabled={page >= Math.ceil(totalStudents / pageSize)}
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
