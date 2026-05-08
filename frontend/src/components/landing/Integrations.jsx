import React from 'react';
import { motion } from 'framer-motion';
import { BRAND } from '../../data/studios';
import { Instagram, Youtube, Twitter, Linkedin, Facebook, ShoppingBag, ShoppingCart, Store, Megaphone, Presentation, HardDrive, Figma, Slack, MessageCircle, BarChart3, Cloud } from 'lucide-react';

const INTEGRATION_COLUMNS = [
    {
        title: 'SOCIAL',
        subtitle: 'Where you publish',
        items: [
            { name: 'Instagram', icon: Instagram, color: '#E1306C' },
            { name: 'TikTok', icon: MusicIcon, color: '#000000', darkColor: '#ffffff' },
            { name: 'YouTube', icon: Youtube, color: '#FF0000' },
            { name: 'X / Twitter', icon: Twitter, color: '#000000', darkColor: '#ffffff' },
            { name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
            { name: 'Facebook', icon: Facebook, color: '#1877F2' },
            { name: 'Threads', icon: MessageCircle, color: '#000000', darkColor: '#ffffff' },
        ]
    },
    {
        title: 'COMMERCE',
        subtitle: 'Where you sell',
        items: [
            { name: 'Shopify', icon: ShoppingBag, color: '#95BF47' },
            { name: 'WooCommerce', icon: ShoppingCart, color: '#96588A' },
            { name: 'Etsy', icon: Store, color: '#F1641E' },
            { name: 'Amazon', icon: ShoppingBag, color: '#FF9900' },
            { name: 'Flipkart', icon: ShoppingBag, color: '#2874F0' },
            { name: 'Magento', icon: ShoppingCart, color: '#F26322' },
            { name: 'BigCommerce', icon: Store, color: '#121118', darkColor: '#ffffff' },
        ]
    },
    {
        title: 'ADS',
        subtitle: 'Where you spend',
        items: [
            { name: 'Meta Ads', icon: Megaphone, color: '#1877F2' },
            { name: 'Google Ads', icon: Megaphone, color: '#4285F4' },
            { name: 'TikTok Ads', icon: Megaphone, color: '#ffffff' },
            { name: 'LinkedIn Ads', icon: Megaphone, color: '#0A66C2' },
            { name: 'X Ads', icon: Megaphone, color: '#ffffff' },
            { name: 'YouTube Ads', icon: Megaphone, color: '#FF0000' },
            { name: 'Amazon Ads', icon: Megaphone, color: '#FF9900' },
        ]
    },
    {
        title: 'TOOLS',
        subtitle: 'Where you work',
        items: [
            { name: 'Slack', icon: Slack, color: '#4A154B', darkColor: '#E01E5A' },
            { name: 'Notion', icon: FileTextIcon, color: '#ffffff' },
            { name: 'Google Drive', icon: HardDrive, color: '#FFBA00' },
            { name: 'Figma', icon: Figma, color: '#F24E1E' },
            { name: 'HubSpot', icon: Share2Icon, color: '#FF7A59' },
            { name: 'Salesforce', icon: Cloud, color: '#00A1E0' },
            { name: 'Klaviyo', icon: BarChart3, color: '#19D6A0' },
        ]
    }
];

function MusicIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
        </svg>
    );
}

function FileTextIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    );
}

function Share2Icon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
    );
}


export default function Integrations() {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
    };

    return (
        <section className="py-24 md:py-32 relative bg-[#0b0b0c] border-b border-white/5 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* Header Row */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-16">
                    <div>
                        <span className="text-[11px] font-bold tracking-widest uppercase mb-4 block" style={{ color: BRAND.primary }}>
                            Integrations
                        </span>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl tracking-tight text-white font-serif leading-[1.1] max-w-2xl">
                            Plugs into <span className="italic" style={{ color: BRAND.primary }}>every channel</span> you already use.
                        </h2>
                    </div>
                    <div className="lg:w-1/3 lg:pt-8">
                        <p className="text-[#a1a1aa] leading-relaxed text-sm md:text-base font-medium">
                            Generate, schedule and publish without leaving Mantram. Performance signals flow back automatically — Pulse Studio sees it all.
                        </p>
                    </div>
                </div>

                {/* Columns Grid */}
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                >
                    {INTEGRATION_COLUMNS.map((col, idx) => (
                        <motion.div key={idx} variants={itemVariants} className="bg-[#121214] border border-white/5 rounded-3xl p-6 flex flex-col">
                            
                            <div className="mb-6">
                                <h3 className="text-[11px] font-bold text-[#FF4D00] uppercase tracking-wider mb-1">{col.title}</h3>
                                <p className="text-[#a1a1aa] text-xs">{col.subtitle}</p>
                            </div>

                            <div className="flex flex-col gap-2">
                                {col.items.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 bg-[#18181b] hover:bg-white/5 border border-white/5 rounded-xl p-3 transition-colors cursor-default">
                                        <div 
                                            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" 
                                            style={{ backgroundColor: `${item.darkColor || item.color}20` }}
                                        >
                                            <item.icon className="w-3.5 h-3.5" style={{ color: item.darkColor || item.color }} strokeWidth={2.5} />
                                        </div>
                                        <span className="text-sm font-semibold text-white">{item.name}</span>
                                    </div>
                                ))}
                            </div>
                            
                        </motion.div>
                    ))}
                </motion.div>

            </div>
        </section>
    );
}
