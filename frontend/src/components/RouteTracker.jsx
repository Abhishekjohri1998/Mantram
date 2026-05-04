import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/analytics';

const RouteTracker = () => {
    const location = useLocation();

    useEffect(() => {
        // Track page view on route change
        trackPageView(location.pathname + location.search);
    }, [location]);

    return null; // This component doesn't render anything
};

export default RouteTracker;
