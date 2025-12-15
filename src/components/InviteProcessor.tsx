import { useRole } from "@/contexts/RoleContext";
import { useInviteHandler } from "@/hooks/useInviteHandler";

/**
 * InviteProcessor
 * 
 * A headless component that sits at the App level (inside RoleProvider).
 * It uses the 'refreshRoles' function from context to ensure that when an invite 
 * is accepted, the user's new school/role is immediately loaded.
 */
export const InviteProcessor = () => {
    const { refreshRoles } = useRole();

    // Pass the refresh function to the handler
    useInviteHandler({ refreshRoles });

    return null; // Render nothing
};
