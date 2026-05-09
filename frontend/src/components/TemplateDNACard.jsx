/**
 * TemplateDNACard — Visual card for a user-created template in the flat grid.
 *
 * Shows:
 *  - Reference image thumbnail
 *  - Template name
 *  - DNA chips (layout, mood, color palette)
 *  - "Use Template" button → opens TemplateFitPanel
 *  - Delete button (with confirmation)
 */

import React, { useState } from 'react';
import './TemplateDNACard.css';

export default function TemplateDNACard({ template, onUse, onDelete, recentGenerations = [] }) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const dna = template.dna || {};
    const colorPalette = Array.isArray(dna.colorPalette) ? dna.colorPalette.slice(0, 4) : [];
    const zones = Array.isArray(dna.contentZones) ? dna.contentZones.map(z => z.role) : [];

    const handleDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setDeleting(true);
        try {
            await onDelete(template._id);
        } finally {
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    return (
        <div className="tdna-card">
            {/* Thumbnail */}
            <div className="tdna-card__thumb">
                {template.previewImageUrl ? (
                    <img src={template.previewImageUrl} alt={template.name} />
                ) : (
                    <div className="tdna-card__thumb-placeholder">
                        <span className="material-symbols-outlined">image</span>
                    </div>
                )}

                {/* Hover overlay */}
                <div className="tdna-card__overlay">
                    <button
                        className="tdna-card__use-btn"
                        onClick={() => onUse(template)}
                        aria-label={`Use ${template.name}`}
                    >
                        <span className="material-symbols-outlined">auto_awesome</span>
                        Use Template
                    </button>
                </div>

                {/* Delete button top-right */}
                <button
                    className={`tdna-card__delete-btn${confirmDelete ? ' confirm' : ''}`}
                    onClick={handleDelete}
                    disabled={deleting}
                    title={confirmDelete ? 'Click again to confirm delete' : 'Delete template'}
                >
                    {deleting
                        ? <span className="material-symbols-outlined spin">progress_activity</span>
                        : confirmDelete
                            ? <span className="material-symbols-outlined">delete_forever</span>
                            : <span className="material-symbols-outlined">delete</span>
                    }
                </button>
            </div>

            {/* Footer */}
            <div className="tdna-card__footer">
                <div className="tdna-card__name" title={template.name}>{template.name}</div>

                {/* DNA chips */}
                <div className="tdna-card__chips">
                    {dna.layout && (
                        <span className="tdna-chip tdna-chip--layout">{dna.layout.replace(/-/g, ' ')}</span>
                    )}
                    {dna.mood && (
                        <span className="tdna-chip tdna-chip--mood">{dna.mood}</span>
                    )}
                    {zones.slice(0, 3).map(z => (
                        <span key={z} className="tdna-chip tdna-chip--zone">{z}</span>
                    ))}
                </div>

                {/* Color palette dots */}
                {colorPalette.length > 0 && (
                    <div className="tdna-card__palette">
                        {colorPalette.map((hex, i) => (
                            <div
                                key={i}
                                className="tdna-palette-dot"
                                style={{ background: hex }}
                                title={hex}
                            />
                        ))}
                    </div>
                )}
            </div>
            {/* Recent Generations */}
            {recentGenerations.length > 0 && (
                <div className="tdna-card__generations">
                    <div className="tdna-card__generations-title">Recent</div>
                    <div className="tdna-card__generations-list">
                        {recentGenerations.slice(0, 3).map((gen, idx) => (
                            <img 
                                key={gen._id || idx} 
                                src={gen.imageUrl || gen.thumbnailUrl} 
                                alt="Generation" 
                                className="tdna-card__generation-img"
                            />
                        ))}
                        {recentGenerations.length > 3 && (
                            <div className="tdna-card__generation-more">+{recentGenerations.length - 3}</div>
                        )}
                    </div>
                </div>
            )}
        </div>

    );
}
