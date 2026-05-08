/**
 * productTaxonomy.js — Stage 4: Product category schema definitions
 *
 * Each category defines:
 *  - fields: specification fields to capture in Pass 2
 *  - criticalFields: must-have fields for validation; triggers retry if missing
 *  - descriptionTemplate: function that converts spec object → dense paragraph
 */

export const PRODUCT_CATEGORIES = {

    wireless_audio: {
        fields: [
            { name: 'earbudForm', description: 'Whether stem-style (AirPod-like elongated stem) or button-style (round compact disc)' },
            { name: 'earbudColor', description: 'Primary color of the earbud body' },
            { name: 'earbudFinish', description: 'Surface finish: matte, glossy, satin, or metallic' },
            { name: 'touchSurface', description: 'Capacitive touch areas visible — location, any markings, logos, or sensor dots' },
            { name: 'microphoneVents', description: 'Visible microphone vent holes — count, location, and arrangement' },
            { name: 'caseForm', description: 'Charging case shape — pill, puck, wedge, rectangular, or oval' },
            { name: 'caseColor', description: 'Primary color of the charging case body' },
            { name: 'hingeType', description: 'How the case opens — top-flip, clamshell, slide, or magnetic snap' },
            { name: 'ledIndicator', description: 'LED indicator — location (front/back/top), shape, and color if visible' },
            { name: 'chargingPort', description: 'Charging port type (USB-C, Lightning, micro-USB) and its location on the case' },
            { name: 'brandLogoPlacement', description: 'Where brand logo appears on both the earbuds and case — exact location' },
        ],
        criticalFields: ['earbudForm', 'caseForm', 'touchSurface', 'chargingPort'],
        descriptionTemplate: (specs) =>
            `${specs.earbudFinish || 'matte'} ${specs.earbudColor || 'white'} ${specs.earbudForm || 'stem-style'}-style earbuds with ${specs.touchSurface || 'capacitive touch surface'} and ${specs.microphoneVents || 'microphone vents'}, paired with a ${specs.caseForm || 'pill-shaped'} charging case in ${specs.caseColor || 'matching'} finish, ${specs.hingeType || 'top-flip'} opening, ${specs.ledIndicator || 'LED indicator on front'}, ${specs.chargingPort || 'USB-C charging port'}, brand logo on ${specs.brandLogoPlacement || 'case lid and earbud face'}.`,
    },

    mobile_accessory: {
        fields: [
            { name: 'accessoryType', description: 'Specific type: phone stand, wireless charger, MagSafe mount, cable, grip, or holder' },
            { name: 'material', description: 'Primary material: aluminum, plastic ABS, silicone, steel, wood' },
            { name: 'pivotPoints', description: 'Number of articulation points or joints visible and what they do' },
            { name: 'foldingMechanism', description: 'How the product folds or collapses for storage' },
            { name: 'surfaceTexture', description: 'Surface texture or finish on main body: brushed, anodized, matte, glossy' },
            { name: 'cableManagement', description: 'Any cable routing features, cutouts, or clips visible' },
            { name: 'baseFootprint', description: 'Base shape and any anti-slip features: round, rectangular, tripod, with rubber feet' },
            { name: 'brandingPlacement', description: 'Where branding, logos, or model numbers appear' },
        ],
        criticalFields: ['accessoryType', 'material', 'pivotPoints'],
        descriptionTemplate: (specs) =>
            `${specs.material || 'aluminum'} ${specs.accessoryType || 'phone stand'} with ${specs.pivotPoints || 'multi-point'} articulation, ${specs.foldingMechanism || 'foldable design'}, ${specs.surfaceTexture || 'brushed'} finish, ${specs.cableManagement || 'cable management'} features, ${specs.baseFootprint || 'non-slip base'}.`,
    },

    computing: {
        fields: [
            { name: 'formFactor', description: 'Type: laptop stand, laptop riser, monitor arm, keyboard tray, desk organizer' },
            { name: 'material', description: 'Primary material: aluminum alloy, steel, wood, acrylic, plastic' },
            { name: 'geometryDescription', description: 'Structural geometry: Z-fold, A-frame, L-bracket, ladder, cantilever' },
            { name: 'ventilationFeatures', description: 'Ventilation cutouts, perforations, or open lattice on the surface' },
            { name: 'contactSurface', description: 'Where the laptop sits — bar contacts, full platform, rubber strips' },
            { name: 'footPads', description: 'Base grip pads — material, count, and location' },
            { name: 'profileWhenFolded', description: 'Thickness and shape when collapsed flat' },
            { name: 'brandLogoPlacement', description: 'Location of brand logo or model engraving' },
        ],
        criticalFields: ['formFactor', 'geometryDescription', 'material'],
        descriptionTemplate: (specs) =>
            `${specs.material || 'aluminum'} ${specs.formFactor || 'laptop stand'} with ${specs.geometryDescription || 'Z-fold'} structure, ${specs.ventilationFeatures || 'ventilation cutouts'}, ${specs.contactSurface || 'dual contact bars'} for laptop placement, ${specs.footPads || 'rubber foot pads'}, folds to ${specs.profileWhenFolded || 'slim profile'}.`,
    },

    wearable_tech: {
        fields: [
            { name: 'caseShape', description: 'Watch case shape: round, square, rectangular, cushion' },
            { name: 'caseMaterial', description: 'Case material: aluminum, titanium, stainless steel, ceramic, plastic' },
            { name: 'caseColor', description: 'Case color and finish: space gray, silver, gold, midnight' },
            { name: 'crownPosition', description: 'Digital crown or button location: right side upper, right side lower, left side' },
            { name: 'crownTexture', description: 'Crown surface texture: knurled, smooth, ridged' },
            { name: 'buttonCount', description: 'Total number of physical buttons visible and their locations' },
            { name: 'strapMaterial', description: 'Band material: silicone, leather, metal link, nylon, rubber' },
            { name: 'strapColor', description: 'Band color' },
            { name: 'closureType', description: 'Band closure method: pin-buckle, magnetic, fold-over clasp, hook-loop' },
            { name: 'screenState', description: 'Whether display is on showing content or off/dark' },
            { name: 'screenContent', description: 'If screen is on, what is shown: watch face type, complications, time' },
            { name: 'sensorPattern', description: 'Sensor arrangement on case back: optical sensors count, layout, color' },
        ],
        criticalFields: ['caseShape', 'crownPosition', 'strapMaterial', 'screenState'],
        descriptionTemplate: (specs) =>
            `${specs.caseShape || 'square'} ${specs.caseMaterial || 'aluminum'} ${specs.caseColor || 'midnight'} smartwatch case with ${specs.crownPosition || 'right-side'} ${specs.crownTexture || 'knurled'} crown, ${specs.buttonCount || 'one'} side button, ${specs.strapColor || 'black'} ${specs.strapMaterial || 'silicone'} band with ${specs.closureType || 'pin-buckle'} closure, screen ${specs.screenState || 'off'}, ${specs.sensorPattern || 'optical heart rate sensor'} on back.`,
    },

    apparel: {
        fields: [
            { name: 'garmentType', description: 'Type: t-shirt, hoodie, jacket, dress, pants, shorts, shirt' },
            { name: 'fabricWeave', description: 'Visible fabric structure: jersey knit, woven, fleece, denim, canvas' },
            { name: 'primaryColor', description: 'Dominant color of the garment' },
            { name: 'secondaryColors', description: 'Any accent, contrast, or trim colors visible' },
            { name: 'stitchingPattern', description: 'Visible seam type and topstitching details' },
            { name: 'closureType', description: 'How the garment closes: pullover, zipper, buttons, snap, drawstring' },
            { name: 'trimDetails', description: 'Ribbing, cuffs, hem style, collar type' },
            { name: 'printOrPattern', description: 'Any graphic, pattern, or print on the fabric' },
            { name: 'silhouette', description: 'Overall shape: fitted, relaxed, oversized, boxy, tapered' },
            { name: 'branding', description: 'Location of labels, embroidery, screen prints, or woven brand marks' },
        ],
        criticalFields: ['garmentType', 'fabricWeave', 'closureType'],
        descriptionTemplate: (specs) =>
            `${specs.silhouette || 'relaxed fit'} ${specs.primaryColor || ''} ${specs.garmentType || 'garment'} in ${specs.fabricWeave || 'jersey knit'} with ${specs.closureType || 'pullover'} construction, ${specs.trimDetails || 'ribbed cuffs and hem'}${specs.printOrPattern ? `, ${specs.printOrPattern}` : ''}, branding at ${specs.branding || 'chest'}.`,
    },

    food_beverage: {
        fields: [
            { name: 'containerType', description: 'Container type: glass bottle, can, carton, bag, bowl, plate, cup, jar' },
            { name: 'containerColor', description: 'Container body color or transparency' },
            { name: 'servingState', description: 'How the product is presented: sealed, open, poured, plated, stacked' },
            { name: 'garnishElements', description: 'Any garnish, toppings, or accompaniments visible' },
            { name: 'liquidColor', description: 'For beverages: liquid color and opacity — amber, clear, dark, milky' },
            { name: 'texture', description: 'For food: surface texture — crispy, smooth, creamy, flaky, glossy' },
            { name: 'steam', description: 'Whether steam or condensation is visible' },
            { name: 'brandingOnContainer', description: 'Label design, logo, and text visible on the container' },
        ],
        criticalFields: ['containerType', 'servingState'],
        descriptionTemplate: (specs) =>
            `${specs.servingState || 'sealed'} ${specs.containerType || 'bottle'} in ${specs.containerColor || 'clear'} with ${specs.brandingOnContainer || 'branded label'}${specs.liquidColor ? `, ${specs.liquidColor} liquid` : ''}${specs.garnishElements ? `, garnished with ${specs.garnishElements}` : ''}${specs.steam ? ', with steam rising' : ''}.`,
    },

    fmcg_cosmetic: {
        fields: [
            { name: 'containerShape', description: 'Shape of the primary container: tube, bottle, jar, pump, stick, compact' },
            { name: 'material', description: 'Container material: plastic, glass, aluminum, paper' },
            { name: 'primaryColor', description: 'Dominant color of the packaging' },
            { name: 'labelDesign', description: 'Label style: full-wrap, front panel, embossed, printed directly' },
            { name: 'logoPlacement', description: 'Where brand name and logo appear on the packaging' },
            { name: 'closureType', description: 'How the container opens: flip cap, pump, screw cap, twist, press-and-turn' },
            { name: 'visibleContents', description: 'Whether product contents are visible through clear packaging' },
            { name: 'brandingTypography', description: 'Font style used for brand name on packaging: serif, sans-serif, script' },
        ],
        criticalFields: ['containerShape', 'primaryColor', 'logoPlacement'],
        descriptionTemplate: (specs) =>
            `${specs.primaryColor || 'white'} ${specs.material || 'plastic'} ${specs.containerShape || 'bottle'} with ${specs.closureType || 'pump'} closure, ${specs.labelDesign || 'front panel label'}, brand logo at ${specs.logoPlacement || 'center'}${specs.visibleContents ? ', product contents visible through packaging' : ''}.`,
    },

    home_hardware: {
        fields: [
            { name: 'objectType', description: 'Specific type: bracket, hinge, handle, knob, light fixture, outlet, switch' },
            { name: 'material', description: 'Primary material: steel, brass, zinc alloy, aluminum, ceramic, nylon' },
            { name: 'finishColor', description: 'Surface finish and color: brushed nickel, polished chrome, matte black, antique brass' },
            { name: 'mountingMechanism', description: 'How it attaches: screws, adhesive, snap-in, friction fit, toggle bolt' },
            { name: 'adjustmentPoints', description: 'Any knobs, levers, or moving parts for adjustment' },
            { name: 'componentCount', description: 'How many individual pieces are visible in the product shot' },
            { name: 'brandingVisibility', description: 'Whether brand name or certification marks are visible, and where' },
        ],
        criticalFields: ['objectType', 'material', 'mountingMechanism'],
        descriptionTemplate: (specs) =>
            `${specs.finishColor || 'brushed nickel'} ${specs.material || 'steel'} ${specs.objectType || 'hardware fitting'} with ${specs.mountingMechanism || 'screw mounting'}, ${specs.componentCount ? `${specs.componentCount} pieces` : 'single piece'}${specs.adjustmentPoints ? `, adjustable via ${specs.adjustmentPoints}` : ''}.`,
    },

};
