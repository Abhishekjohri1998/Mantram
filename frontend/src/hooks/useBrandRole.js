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
            hasAccess: false,
            canDelete: false,
            canInvite: false,
            canRemoveMember: false,
            canEditBrandDNA: false,
            roleLabel: 'Guest'
        };
    }

    // Role check: Is current user the brand creator/owner?
    const brandOwnerId = activeBrand.user?._id || activeBrand.user;
    const currentUserId = user._id || user.id;
    const isOwner = String(brandOwnerId) === String(currentUserId);

    // Check if this specific brand is in user's brandAccess (for non-owners)
    const hasThisBrandAccess = isOwner || 
        (user.brandAccess || []).some(id => String(id) === String(activeBrand._id));

    return {
        isOwner,
        isMember: !isOwner && hasThisBrandAccess,
        hasAccess: isOwner || hasThisBrandAccess,

        // Granular permission flags based on ownership and team role
        canDelete: isOwner,
        canInvite: isOwner || user.teamRole === 'manager',
        canRemoveMember: isOwner || user.teamRole === 'manager',
        canEditBrandDNA: isOwner || user.teamRole === 'manager',
        
        // Specific helpers
        roleLabel: isOwner ? 'Owner' : (user.teamRole || 'Member'),
        
        // Useful for brand switcher UI
        accessibleBrandIds: (user.brandAccess || []).map(String),
    };
}
