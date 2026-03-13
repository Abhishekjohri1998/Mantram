/**
 * ReportCharts — Reusable chart components for Studio Reports
 * Wraps Chart.js via react-chartjs-2 with brand-color theming.
 */

import React, { useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    RadialLinearScale,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Radar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
    CategoryScale, LinearScale, BarElement, LineElement, PointElement,
    ArcElement, RadialLinearScale, Title, Tooltip, Legend, Filler
);

// Default color palette (overridden by brand colors)
const DEFAULT_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#a855f7',
];

function getColors(branding, count = 6) {
    const base = [
        branding?.primaryColor || DEFAULT_COLORS[0],
        branding?.secondaryColor || DEFAULT_COLORS[1],
        branding?.accentColor || DEFAULT_COLORS[2],
        ...DEFAULT_COLORS.slice(3),
    ];
    return Array.from({ length: count }, (_, i) => base[i % base.length]);
}

function hexToRgba(hex, alpha = 0.15) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Shared chart options ──
function baseOptions(title, dark = true) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    color: dark ? '#e2e8f0' : '#1e293b',
                    font: { size: 11 },
                    padding: 16,
                    usePointStyle: true,
                },
            },
            title: {
                display: !!title,
                text: title,
                color: dark ? '#f1f5f9' : '#0f172a',
                font: { size: 14, weight: '600' },
                padding: { bottom: 16 },
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleFont: { size: 12 },
                bodyFont: { size: 11 },
                padding: 10,
                cornerRadius: 8,
            },
        },
        scales: {},
    };
}

function axisOpts(dark = true) {
    return {
        ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 10 } },
        grid: { color: dark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.06)' },
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// CHART COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

export function ReportBarChart({ data, branding, title, height = 280 }) {
    const colors = getColors(branding, data.datasets?.length || 1);
    const chartData = useMemo(() => ({
        labels: data.labels || [],
        datasets: (data.datasets || []).map((ds, i) => ({
            ...ds,
            backgroundColor: hexToRgba(colors[i], 0.7),
            borderColor: colors[i],
            borderWidth: 1.5,
            borderRadius: 6,
        })),
    }), [data, branding]);

    const options = {
        ...baseOptions(title),
        scales: { x: axisOpts(), y: axisOpts() },
    };

    return (
        <div style={{ height, width: '100%' }}>
            <Bar data={chartData} options={options} />
        </div>
    );
}

export function ReportLineChart({ data, branding, title, height = 280 }) {
    const colors = getColors(branding, data.datasets?.length || 1);
    const chartData = useMemo(() => ({
        labels: data.labels || [],
        datasets: (data.datasets || []).map((ds, i) => ({
            ...ds,
            borderColor: colors[i],
            backgroundColor: hexToRgba(colors[i], 0.1),
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: colors[i],
            borderWidth: 2,
        })),
    }), [data, branding]);

    const options = {
        ...baseOptions(title),
        scales: { x: axisOpts(), y: axisOpts() },
    };

    return (
        <div style={{ height, width: '100%' }}>
            <Line data={chartData} options={options} />
        </div>
    );
}

export function ReportPieChart({ data, branding, title, height = 280 }) {
    const colors = getColors(branding, data.labels?.length || 6);
    const chartData = useMemo(() => ({
        labels: data.labels || [],
        datasets: [{
            data: data.datasets?.[0]?.data || [],
            backgroundColor: colors.map(c => hexToRgba(c, 0.7)),
            borderColor: colors,
            borderWidth: 2,
        }],
    }), [data, branding]);

    return (
        <div style={{ height, width: '100%' }}>
            <Pie data={chartData} options={baseOptions(title)} />
        </div>
    );
}

export function ReportDoughnutChart({ data, branding, title, height = 280 }) {
    const colors = getColors(branding, data.labels?.length || 6);
    const chartData = useMemo(() => ({
        labels: data.labels || [],
        datasets: [{
            data: data.datasets?.[0]?.data || [],
            backgroundColor: colors.map(c => hexToRgba(c, 0.7)),
            borderColor: colors,
            borderWidth: 2,
        }],
    }), [data, branding]);

    const options = {
        ...baseOptions(title),
        cutout: '55%',
    };

    return (
        <div style={{ height, width: '100%' }}>
            <Doughnut data={chartData} options={options} />
        </div>
    );
}

export function ReportRadarChart({ data, branding, title, height = 280 }) {
    const colors = getColors(branding, data.datasets?.length || 1);
    const chartData = useMemo(() => ({
        labels: data.labels || [],
        datasets: (data.datasets || []).map((ds, i) => ({
            ...ds,
            borderColor: colors[i],
            backgroundColor: hexToRgba(colors[i], 0.2),
            pointBackgroundColor: colors[i],
            borderWidth: 2,
        })),
    }), [data, branding]);

    const options = {
        ...baseOptions(title),
        scales: {
            r: {
                grid: { color: 'rgba(148, 163, 184, 0.15)' },
                pointLabels: { color: '#94a3b8', font: { size: 10 } },
                ticks: { display: false },
            },
        },
    };

    return (
        <div style={{ height, width: '100%' }}>
            <Radar data={chartData} options={options} />
        </div>
    );
}

// ── Universal chart renderer ──
export function ReportChart({ chartType, data, branding, title, height }) {
    const props = { data, branding, title, height };
    switch (chartType) {
        case 'bar': return <ReportBarChart {...props} />;
        case 'line': return <ReportLineChart {...props} />;
        case 'pie': return <ReportPieChart {...props} />;
        case 'doughnut': return <ReportDoughnutChart {...props} />;
        case 'radar': return <ReportRadarChart {...props} />;
        default: return <ReportBarChart {...props} />;
    }
}

export default ReportChart;
