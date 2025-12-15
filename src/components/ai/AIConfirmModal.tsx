/**
 * AI Confirm Modal Component
 * Shows pending write actions for principal confirmation
 */

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, X, Loader2 } from 'lucide-react';

export interface PendingAction {
    id: string;
    action_type: string;
    action_summary: string;
    action_data: Record<string, any>;
    expires_at: string;
}

interface AIConfirmModalProps {
    action: PendingAction | null;
    isOpen: boolean;
    isLoading: boolean;
    onConfirm: (actionId: string) => void;
    onCancel: () => void;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    add_student: { label: 'Add Student', color: 'bg-green-100 text-green-700' },
    update_student: { label: 'Update Student', color: 'bg-blue-100 text-blue-700' },
    delete_student: { label: 'Delete Student', color: 'bg-red-100 text-red-700' },
    add_staff: { label: 'Add Staff', color: 'bg-green-100 text-green-700' },
    update_attendance: { label: 'Update Attendance', color: 'bg-yellow-100 text-yellow-700' },
    add_payment: { label: 'Record Payment', color: 'bg-purple-100 text-purple-700' },
    add_expense: { label: 'Add Expense', color: 'bg-orange-100 text-orange-700' },
    default: { label: 'Action', color: 'bg-gray-100 text-gray-700' },
};

export function AIConfirmModal({
    action,
    isOpen,
    isLoading,
    onConfirm,
    onCancel,
}: AIConfirmModalProps) {
    if (!action) return null;

    const actionConfig = ACTION_LABELS[action.action_type] || ACTION_LABELS.default;
    const expiresAt = new Date(action.expires_at);
    const timeLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    const isExpired = timeLeft <= 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                            <DialogTitle>Confirm AI Action</DialogTitle>
                            <DialogDescription>
                                Review and approve this action
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Action Type Badge */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Action:</span>
                        <Badge className={actionConfig.color}>
                            {actionConfig.label}
                        </Badge>
                    </div>

                    {/* Summary */}
                    <div className="p-4 rounded-lg bg-muted">
                        <p className="text-sm">{action.action_summary}</p>
                    </div>

                    {/* Data Preview */}
                    {action.action_data && Object.keys(action.action_data).length > 0 && (
                        <div className="space-y-2">
                            <span className="text-sm font-medium">Details:</span>
                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs font-mono max-h-32 overflow-auto">
                                {Object.entries(action.action_data).map(([key, value]) => (
                                    <div key={key} className="flex gap-2">
                                        <span className="text-muted-foreground">{key}:</span>
                                        <span>{JSON.stringify(value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Expiry Warning */}
                    {!isExpired && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Expires in:</span>
                            <span className={timeLeft < 60 ? 'text-red-500 font-medium' : ''}>
                                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                            </span>
                        </div>
                    )}

                    {isExpired && (
                        <div className="flex items-center gap-2 text-sm text-red-500">
                            <X className="h-4 w-4" />
                            <span>This action has expired</span>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onConfirm(action.id)}
                        disabled={isLoading || isExpired}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Confirm & Execute
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
