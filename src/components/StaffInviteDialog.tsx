/**
 * Staff Invite Dialog
 * 
 * UI for principals to send magic link invites to staff members.
 * Collects email and role, calls edge function to send invite.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Mail, UserPlus } from 'lucide-react';

interface StaffInviteDialogProps {
    schoolId: string;
    onInviteSent?: () => void;
}

export const StaffInviteDialog = ({ schoolId, onInviteSent }: StaffInviteDialogProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<string>('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!email.trim()) {
            toast.error('Please enter an email address');
            return;
        }

        if (!role) {
            toast.error('Please select a role');
            return;
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            toast.error('Please enter a valid email address');
            return;
        }

        if (!schoolId) {
            toast.error('School context missing. Please refresh the page.');
            console.error('Missing schoolId in StaffInviteDialog');
            return;
        }

        setIsSubmitting(true);

        try {
            // Get current session for auth header
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                toast.error('You must be logged in to send invites');
                return;
            }

            // Call edge function
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL || 'https://fhrskehzyvaqrgfyqopg.supabase.co'}/functions/v1/send-staff-invite`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        email: email.trim().toLowerCase(),
                        role,
                        school_id: schoolId,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.ok) {
                throw new Error(result.error || 'Failed to send invite');
            }

            toast.success(`Invite sent to ${email}`);
            setEmail('');
            setRole('');
            setIsOpen(false);
            onInviteSent?.();

        } catch (err: any) {
            console.error('Send invite error:', err);
            toast.error(err.message || 'Failed to send invite');
        } finally {
            setIsSubmitting(false);
        }
    };

    const roles = [
        { value: 'teacher', label: 'Teacher', description: 'Manage classes and attendance' },
        { value: 'finance', label: 'Finance Staff', description: 'Manage payments and expenses' },
        { value: 'admin', label: 'Administrator', description: 'Full school management access' },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    Invite Staff
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" />
                        Invite Staff Member
                    </DialogTitle>
                    <DialogDescription>
                        Send a magic link invitation. They'll receive an email to join your school.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                        <Label htmlFor="invite-email">Email Address</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            placeholder="staff@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isSubmitting}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="invite-role">Role</Label>
                        <Select value={role} onValueChange={setRole} disabled={isSubmitting}>
                            <SelectTrigger id="invite-role">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                {roles.map((r) => (
                                    <SelectItem key={r.value} value={r.value}>
                                        <div className="flex flex-col">
                                            <span>{r.label}</span>
                                            <span className="text-xs text-muted-foreground">{r.description}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsOpen(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Mail className="w-4 h-4 mr-2" />
                                    Send Invite
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
