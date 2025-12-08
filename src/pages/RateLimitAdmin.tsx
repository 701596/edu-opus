import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Shield, ShieldAlert, ShieldOff, RefreshCw, Ban, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
    getRateLimitStats,
    adminBlockIP,
    adminUnblockIP,
    adminBlockUser,
    adminUnblockUser,
    disableRateLimiting,
    enableRateLimiting,
    isRateLimitingDisabled,
    clearViolations,
} from '@/lib/rateLimitMiddleware';
import { RATE_LIMITING_ENABLED, RATE_LIMIT_ADMIN_EMAILS } from '@/lib/rateLimitConfig';

interface ViolationLog {
    userId: string | null;
    ip: string | undefined;
    endpoint: string;
    count: number;
    limit: number;
    action: 'warn' | 'block' | 'kill';
    escalationLevel: number;
}

export default function RateLimitAdmin() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<ReturnType<typeof getRateLimitStats> | null>(null);
    const [dbStats, setDbStats] = useState<any>(null);
    const [ipToBlock, setIpToBlock] = useState('');
    const [userToBlock, setUserToBlock] = useState('');
    const [isEnabled, setIsEnabled] = useState(!isRateLimitingDisabled());

    // Check admin access
    useEffect(() => {
        async function checkAccess() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && RATE_LIMIT_ADMIN_EMAILS.includes(user.email || '')) {
                setIsAdmin(true);
            }
            setIsLoading(false);
        }
        checkAccess();
    }, []);

    // Refresh stats
    const refreshStats = async () => {
        setStats(getRateLimitStats());

        // Try to get DB stats
        try {
            const { data } = await (supabase as any).rpc('get_rate_limit_stats', { p_hours: 24 });
            if (data) setDbStats(data);
        } catch {
            // Ignore if function doesn't exist yet
        }
    };

    useEffect(() => {
        if (isAdmin) {
            refreshStats();
            const interval = setInterval(refreshStats, 30000);
            return () => clearInterval(interval);
        }
    }, [isAdmin]);

    const handleToggleRateLimiting = () => {
        if (isEnabled) {
            disableRateLimiting();
        } else {
            enableRateLimiting();
        }
        setIsEnabled(!isEnabled);
    };

    const handleBlockIP = () => {
        if (ipToBlock.trim()) {
            adminBlockIP(ipToBlock.trim(), 3600);
            setIpToBlock('');
            refreshStats();
        }
    };

    const handleUnblockIP = (ip: string) => {
        adminUnblockIP(ip);
        refreshStats();
    };

    const handleBlockUser = () => {
        if (userToBlock.trim()) {
            adminBlockUser(userToBlock.trim(), 3600);
            setUserToBlock('');
            refreshStats();
        }
    };

    const handleUnblockUser = (userId: string) => {
        adminUnblockUser(userId);
        refreshStats();
    };

    const handleClearViolations = () => {
        clearViolations();
        refreshStats();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Alert variant="destructive" className="max-w-md">
                    <ShieldOff className="h-4 w-4" />
                    <AlertTitle>Access Denied</AlertTitle>
                    <AlertDescription>
                        You do not have permission to access the rate limit admin panel.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Shield className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">Rate Limit Admin</h1>
                        <p className="text-muted-foreground">Monitor and manage rate limiting</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={isEnabled}
                            onCheckedChange={handleToggleRateLimiting}
                            id="rate-limit-toggle"
                        />
                        <label htmlFor="rate-limit-toggle" className="text-sm">
                            {isEnabled ? 'Enabled' : 'Disabled'}
                        </label>
                    </div>
                    <Button onClick={refreshStats} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {!RATE_LIMITING_ENABLED && (
                <Alert className="mb-6">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Rate Limiting Disabled</AlertTitle>
                    <AlertDescription>
                        Rate limiting is disabled via environment variable. Set VITE_RATE_LIMITING_ENABLED=true to enable.
                    </AlertDescription>
                </Alert>
            )}

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4 mb-8">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Store Size</CardDescription>
                        <CardTitle className="text-2xl">{stats?.storeSize || 0}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Active counters</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Violations</CardDescription>
                        <CardTitle className="text-2xl">{stats?.violations.length || 0}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Last 100 logged</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Blocked IPs</CardDescription>
                        <CardTitle className="text-2xl">{stats?.blockedIPs.length || 0}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Currently blocked</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Blocked Users</CardDescription>
                        <CardTitle className="text-2xl">{stats?.blockedUsers.length || 0}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Currently blocked</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="violations" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="violations">Violations</TabsTrigger>
                    <TabsTrigger value="blocks">Blocks</TabsTrigger>
                    <TabsTrigger value="manage">Manage</TabsTrigger>
                </TabsList>

                <TabsContent value="violations" className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Recent Violations</CardTitle>
                                <CardDescription>Last 100 rate limit violations</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleClearViolations}>
                                Clear All
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Endpoint</TableHead>
                                        <TableHead>User/IP</TableHead>
                                        <TableHead>Count/Limit</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Level</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats?.violations.slice(0, 20).map((v: ViolationLog, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-mono text-sm">{v.endpoint}</TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {v.userId?.slice(0, 8) || v.ip || 'unknown'}
                                            </TableCell>
                                            <TableCell>{v.count}/{v.limit}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    v.action === 'kill' ? 'destructive' :
                                                        v.action === 'block' ? 'secondary' : 'outline'
                                                }>
                                                    {v.action}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    v.escalationLevel === 3 ? 'destructive' :
                                                        v.escalationLevel === 2 ? 'secondary' : 'outline'
                                                }>
                                                    L{v.escalationLevel}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(!stats?.violations || stats.violations.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                                                No violations recorded
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="blocks" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Ban className="h-5 w-5" />
                                    Blocked IPs
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {stats?.blockedIPs.length ? (
                                    <ul className="space-y-2">
                                        {stats.blockedIPs.map((ip) => (
                                            <li key={ip} className="flex items-center justify-between p-2 bg-muted rounded">
                                                <code className="text-sm">{ip}</code>
                                                <Button size="sm" variant="ghost" onClick={() => handleUnblockIP(ip)}>
                                                    <CheckCircle className="h-4 w-4" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-muted-foreground">No IPs currently blocked</p>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Ban className="h-5 w-5" />
                                    Blocked Users
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {stats?.blockedUsers.length ? (
                                    <ul className="space-y-2">
                                        {stats.blockedUsers.map((userId) => (
                                            <li key={userId} className="flex items-center justify-between p-2 bg-muted rounded">
                                                <code className="text-sm">{userId.slice(0, 12)}...</code>
                                                <Button size="sm" variant="ghost" onClick={() => handleUnblockUser(userId)}>
                                                    <CheckCircle className="h-4 w-4" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-muted-foreground">No users currently blocked</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="manage" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Block IP Address</CardTitle>
                                <CardDescription>Manually block an IP for 1 hour</CardDescription>
                            </CardHeader>
                            <CardContent className="flex gap-2">
                                <Input
                                    placeholder="IP Address (e.g., 192.168.1.1)"
                                    value={ipToBlock}
                                    onChange={(e) => setIpToBlock(e.target.value)}
                                />
                                <Button onClick={handleBlockIP}>
                                    <Ban className="h-4 w-4 mr-2" />
                                    Block
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Block User ID</CardTitle>
                                <CardDescription>Manually block a user for 1 hour</CardDescription>
                            </CardHeader>
                            <CardContent className="flex gap-2">
                                <Input
                                    placeholder="User UUID"
                                    value={userToBlock}
                                    onChange={(e) => setUserToBlock(e.target.value)}
                                />
                                <Button onClick={handleBlockUser}>
                                    <Ban className="h-4 w-4 mr-2" />
                                    Block
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5 text-destructive" />
                                Emergency Controls
                            </CardTitle>
                            <CardDescription>Use with caution - affects all users</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Disable Rate Limiting</AlertTitle>
                                <AlertDescription>
                                    This will disable all rate limiting for this browser session.
                                    Use only in emergency situations.
                                </AlertDescription>
                            </Alert>
                            <div className="flex items-center gap-4">
                                <Switch
                                    checked={!isEnabled}
                                    onCheckedChange={() => handleToggleRateLimiting()}
                                    id="emergency-disable"
                                />
                                <label htmlFor="emergency-disable">
                                    Emergency Disable (Current: {isEnabled ? 'Active' : 'Disabled'})
                                </label>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
