import { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

export function useModelStatus() {
    const [statuses, setStatuses] = useState({});

    useEffect(() => {
        let isMounted = true;
        const fetchStatus = async () => {
            try {
                // apiFetch handles authorization under the hood
                const res = await apiFetch('/creatives/model-status');
                if (isMounted && res.success) {
                    setStatuses(res.statuses || {});
                }
            } catch (err) {
                console.error('Failed to fetch model statuses:', err);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 120000); // Poll every 2 minutes
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    return statuses;
}
