import mongoose from 'mongoose';

/**
 * ProductContext — Saved Product Creative Context
 *
 * A PCC is a reusable design intelligence session for a specific product.
 * Once saved, it can be recalled by any Pulse Studio tool (Deck, Mailer, 
 * Landing Page, A+ Listing, Quick Posts) to ensure all creatives for 
 * a product look like they came from the same design session.
 */
const ProductContextSchema = new mongoose.Schema({
    // Ownership
    brandId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },

    // Product identification
    productName:     { type: String, required: true },   // Primary key for search / display
    productCategory: { type: String, default: '' },
    productBrand:    { type: String, default: '' },       // The brand name ON the product (e.g. "Mobilla")
    productUrl:      { type: String, default: '' },

    // Product images (S3 or CDN URLs — used as references in all generators)
    productImages: [{ type: String }],

    // Design Color Palette — array of { hex, name, role }
    // role: 'primary' | 'accent' | 'neutral' | 'text' | 'background_suggestion'
    palette: [{
        hex:  { type: String },
        name: { type: String },
        role: { type: String },
    }],

    // Full Product DNA from PDI analysis
    productDNA: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Mood direction selection
    selectedMoodId:   { type: String, default: '' },      // e.g. 'urban_kinetic'
    moodDirections:   { type: mongoose.Schema.Types.Mixed, default: {} }, // id → mood object
    moodImages:       { type: mongoose.Schema.Types.Mixed, default: {} }, // id → imageUrl

    // Computed design context (from buildDesignContext())
    designContext:    { type: mongoose.Schema.Types.Mixed, default: null },

    // Usage tracking — which tools have used this context
    usedIn: [{ type: String }],   // ['quick_post', 'aplus', 'deck', 'mail', 'page']

    // Metadata
    tags:      [{ type: String }],
    thumbnail: { type: String, default: '' },   // mood board image URL for gallery preview
    notes:     { type: String, default: '' },   // optional user notes
}, {
    timestamps: true,
});

// Compound index for efficient brand + search queries
ProductContextSchema.index({ brandId: 1, productName: 1 });
ProductContextSchema.index({ brandId: 1, createdAt: -1 });

// Mark a tool as having used this context
ProductContextSchema.methods.markUsedIn = function(tool) {
    if (!this.usedIn.includes(tool)) {
        this.usedIn.push(tool);
        return this.save();
    }
    return Promise.resolve(this);
};

export default mongoose.model('ProductContext', ProductContextSchema);
