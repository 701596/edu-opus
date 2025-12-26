import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { RoleProvider } from "@/contexts/RoleContext";
import { ProtectedRoute, PrincipalRoute, TeacherRoute /* FinanceRoute */ } from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Staff from "./pages/Staff";

import Payments from "./pages/Payments";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import RemainingFees from "./pages/RemainingFees";
import RateLimitAdmin from "./pages/RateLimitAdmin";
import Attendance from "./pages/Attendance";
import SuperAI from "./pages/SuperAI";
import AcceptInvite from "./pages/AcceptInvite";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <RoleProvider>
          <CurrencyProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>

              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />

                {/* Accept Invite - Public route for magic link */}
                <Route path="/accept-invite" element={<AcceptInvite />} />


                {/* Protected Routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <Layout><Dashboard /></Layout>
                  </ProtectedRoute>
                } />
                <Route path="/students" element={
                  <ProtectedRoute>
                    <Layout><Students /></Layout>
                  </ProtectedRoute>
                } />
                <Route path="/staff" element={
                  <PrincipalRoute>
                    <Layout><Staff /></Layout>
                  </PrincipalRoute>
                } />
                <Route path="/payments" element={
                  <ProtectedRoute>
                    <Layout><Payments /></Layout>
                  </ProtectedRoute>
                } />
                <Route path="/expenses" element={
                  <ProtectedRoute>
                    <Layout><Expenses /></Layout>
                  </ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute>
                    <Layout><Reports /></Layout>
                  </ProtectedRoute>
                } />
                <Route path="/remaining-fees" element={
                  <ProtectedRoute>
                    <Layout><RemainingFees /></Layout>
                  </ProtectedRoute>
                } />

                {/* Attendance - Teachers and Principal */}
                <Route path="/attendance" element={
                  <ProtectedRoute>
                    <Layout><Attendance /></Layout>
                  </ProtectedRoute>
                } />
                <Route path="/my-classes" element={
                  <ProtectedRoute>
                    <Layout><Attendance /></Layout>
                  </ProtectedRoute>
                } />

                {/* AI Assistant - Principal Only */}
                <Route path="/super-ai" element={
                  <PrincipalRoute>
                    <SuperAI />
                  </PrincipalRoute>
                } />

                {/* Admin Routes */}
                <Route path="/admin/rate-limits" element={
                  <PrincipalRoute>
                    <Layout><RateLimitAdmin /></Layout>
                  </PrincipalRoute>
                } />

                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </CurrencyProvider>
        </RoleProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

