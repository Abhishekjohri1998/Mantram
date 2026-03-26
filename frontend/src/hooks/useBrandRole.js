import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';

/**
 * Hook to derive permissions for the current user and active brand.
 * Use this to hide/disable UI elements based on the user's role.
 */
export function useBrandRole() {
    const { user } = useAuth();
    const { activeBrand } = useBrand();

    // Default: no permissions if not loaded
    if (!activeBrand || !user) {
        return { 
            isOwner: false, 
            isMember: false,
            canDelete: false,
            canInvite: false,
            canRemoveMember: false,
            canEditBrandDNA: false
        };
    }

    // Role check: Is current user the brand creator/owner?
    // activeBrand.user can be an ID or an object with _id
    const brandOwnerId = activeBrand.user?._id || activeBrand.user;
    const currentUserId = user._id || user.id;
    
    const isOwner = String(brandOwnerId) === String(currentUserId);

    return {
        isOwner,
        isMember: !isOwner,
        
        // Granular permission flags based on ownership and team role
        canDelete: isOwner,
        canInvite: isOwner || user.teamRole === 'manager',
        canRemoveMember: isOwner || user.teamRole === 'manager',
        canEditBrandDNA: isOwner || user.teamRole === 'manager' || user.role === 'admin' || user.role === 'superadmin',
        
        // Specific helpers
        roleLabel: isOwner ? 'Owner' : (user.teamRole || 'Member'),
    };
}
