// Canvas Editor — SVG Design Elements & Interactive App Configs
// SVG paths for Frames, Speech Bubbles, Ribbons, Social, Arrows, Borders

export const SVG_ELEMENT_CATEGORIES = {
  frames: { label: 'Frames', icon: 'crop_free', items: [
    { id: 'svg-frame-simple', label: 'Simple Frame', path: 'M10,10 L390,10 L390,390 L10,390 Z M30,30 L370,30 L370,370 L30,370 Z', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 2 },
    { id: 'svg-frame-rounded', label: 'Rounded Frame', path: 'M30,10 L370,10 Q390,10 390,30 L390,370 Q390,390 370,390 L30,390 Q10,390 10,370 L10,30 Q10,10 30,10 Z M50,30 L350,30 Q370,30 370,50 L370,350 Q370,370 350,370 L50,370 Q30,370 30,350 L30,50 Q30,30 50,30 Z', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 1 },
    { id: 'svg-frame-double', label: 'Double Frame', path: 'M5,5 L395,5 L395,395 L5,395 Z M15,15 L385,15 L385,385 L15,385 Z M35,35 L365,35 L365,365 L35,365 Z M45,45 L355,45 L355,355 L45,355 Z', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 1 },
    { id: 'svg-frame-ornament', label: 'Corner Ornament', path: 'M10,40 L10,10 L40,10 M360,10 L390,10 L390,40 M390,360 L390,390 L360,390 M40,390 L10,390 L10,360', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 3 },
    { id: 'svg-frame-circle', label: 'Circle Frame', path: 'M200,10 A190,190 0 1,1 199.99,10 Z M200,30 A170,170 0 1,0 200.01,30 Z', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 1 },
  ]},
  bubbles: { label: 'Speech Bubbles', icon: 'chat_bubble', items: [
    { id: 'svg-bubble-round', label: 'Round Bubble', path: 'M200,30 Q370,30 370,170 Q370,310 200,310 Q180,310 160,305 L100,370 L130,290 Q30,280 30,170 Q30,30 200,30 Z', w: 400, h: 400, fill: '#ffffff', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-bubble-square', label: 'Square Bubble', path: 'M30,30 L370,30 L370,270 L170,270 L100,350 L130,270 L30,270 Z', w: 400, h: 380, fill: '#ffffff', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-bubble-thought', label: 'Thought Cloud', path: 'M200,40 Q320,20 350,100 Q400,120 370,200 Q390,280 300,300 Q280,360 200,340 Q100,360 80,300 Q10,290 30,200 Q0,120 60,100 Q80,20 200,40 Z M140,350 A25,25 0 1,1 140.01,350 Z M100,380 A15,15 0 1,1 100.01,380 Z', w: 400, h: 400, fill: '#ffffff', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-bubble-shout', label: 'Shout Bubble', path: 'M200,20 L230,80 L330,40 L290,120 L380,140 L300,190 L370,270 L270,240 L250,340 L200,260 L150,340 L130,240 L30,270 L100,190 L20,140 L110,120 L70,40 L170,80 Z', w: 400, h: 360, fill: '#ffffff', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-bubble-chat', label: 'Chat Bubble', path: 'M50,30 L350,30 Q370,30 370,50 L370,230 Q370,250 350,250 L150,250 L80,320 L100,250 L50,250 Q30,250 30,230 L30,50 Q30,30 50,30 Z', w: 400, h: 340, fill: '#ffffff', stroke: 'none', strokeWidth: 0 },
  ]},
  ribbons: { label: 'Ribbons & Banners', icon: 'bookmark', items: [
    { id: 'svg-ribbon-horizontal', label: 'Ribbon Banner', path: 'M0,60 L40,60 L40,10 L360,10 L360,60 L400,60 L380,90 L400,120 L360,120 L360,170 L40,170 L40,120 L0,120 L20,90 Z', w: 400, h: 180, fill: '#6366f1', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-ribbon-corner', label: 'Corner Ribbon', path: 'M280,0 L400,0 L400,120 L370,90 L120,340 L90,370 L0,400 L0,280 L280,0 Z', w: 400, h: 400, fill: '#ef4444', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-ribbon-bookmark', label: 'Bookmark', path: 'M80,0 L320,0 L320,400 L200,320 L80,400 Z', w: 400, h: 400, fill: '#f59e0b', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-ribbon-flag', label: 'Flag Banner', path: 'M40,20 L40,380 L200,300 L360,380 L360,20 Z', w: 400, h: 400, fill: '#22c55e', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-ribbon-scroll', label: 'Scroll', path: 'M60,80 Q60,40 100,40 L300,40 Q340,40 340,80 L340,320 Q340,360 300,360 L100,360 Q60,360 60,320 Z M40,60 Q40,30 70,30 L50,30 Q20,30 20,60 L20,100 L40,100 Z M360,60 L380,60 L380,100 L360,100 Q360,60 360,60 Z', w: 400, h: 400, fill: '#fef3c7', stroke: '#d97706', strokeWidth: 2 },
  ]},
  social: { label: 'Social Frames', icon: 'share', items: [
    { id: 'svg-social-ig', label: 'Instagram Frame', path: 'M80,10 L320,10 Q390,10 390,80 L390,320 Q390,390 320,390 L80,390 Q10,390 10,320 L10,80 Q10,10 80,10 Z M80,30 L320,30 Q370,30 370,80 L370,320 Q370,370 320,370 L80,370 Q30,370 30,320 L30,80 Q30,30 80,30 Z M310,70 A20,20 0 1,1 310.01,70 Z M200,110 A90,90 0 1,1 200.01,110 Z M200,130 A70,70 0 1,0 200.01,130 Z', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 1 },
    { id: 'svg-social-quote', label: 'Quote Card', path: 'M20,20 L380,20 Q390,20 390,30 L390,370 Q390,380 380,380 L20,380 Q10,380 10,370 L10,30 Q10,20 20,20 Z M10,60 L390,60 M60,40 A8,8 0 1,1 60.01,40 M85,40 A8,8 0 1,1 85.01,40 M110,40 A8,8 0 1,1 110.01,40', w: 400, h: 400, fill: '#1e293b', stroke: '#334155', strokeWidth: 1 },
    { id: 'svg-social-like', label: 'Like Heart', path: 'M200,360 L40,200 A100,100 0 0,1 200,80 A100,100 0 0,1 360,200 Z', w: 400, h: 400, fill: '#ef4444', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-social-play', label: 'Play Button', path: 'M200,10 A190,190 0 1,1 199.99,10 Z M160,120 L160,280 L300,200 Z', w: 400, h: 400, fill: '#1e293b', stroke: '#ffffff', strokeWidth: 2 },
  ]},
  arrows: { label: 'Decorative Arrows', icon: 'north_east', items: [
    { id: 'svg-arrow-curved', label: 'Curved Arrow', path: 'M40,300 Q40,100 200,60 Q360,20 360,100 L340,80 L360,100 L380,80 M360,100 Q360,20 200,60', w: 400, h: 340, fill: 'transparent', stroke: '#ffffff', strokeWidth: 3 },
    { id: 'svg-arrow-loop', label: 'Loop Arrow', path: 'M100,200 Q100,60 200,60 Q300,60 300,150 Q300,240 200,240 L220,220 M200,240 L220,260', w: 400, h: 300, fill: 'transparent', stroke: '#ffffff', strokeWidth: 3 },
    { id: 'svg-arrow-zigzag', label: 'Zigzag Arrow', path: 'M40,200 L120,100 L200,200 L280,100 L340,200 L360,180 M340,200 L360,220', w: 400, h: 260, fill: 'transparent', stroke: '#ffffff', strokeWidth: 3 },
    { id: 'svg-arrow-fat', label: 'Fat Arrow', path: 'M40,150 L250,150 L250,80 L380,200 L250,320 L250,250 L40,250 Z', w: 400, h: 400, fill: '#6366f1', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-arrow-circle', label: 'Circle Arrow', path: 'M200,40 A160,160 0 1,1 80,120 M80,120 L100,100 M80,120 L60,100', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 3 },
  ]},
  borders: { label: 'Borders & Corners', icon: 'border_style', items: [
    { id: 'svg-border-dashed', label: 'Dashed Border', path: 'M20,20 L120,20 M160,20 L240,20 M280,20 L380,20 L380,120 M380,160 L380,240 M380,280 L380,380 L280,380 M240,380 L160,380 M120,380 L20,380 L20,280 M20,240 L20,160 M20,120 L20,20', w: 400, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 2 },
    { id: 'svg-border-dots', label: 'Dotted Border', path: 'M20,20 A3,3 0 1,1 20.01,20 M60,20 A3,3 0 1,1 60.01,20 M100,20 A3,3 0 1,1 100.01,20 M140,20 A3,3 0 1,1 140.01,20 M180,20 A3,3 0 1,1 180.01,20 M220,20 A3,3 0 1,1 220.01,20 M260,20 A3,3 0 1,1 260.01,20 M300,20 A3,3 0 1,1 300.01,20 M340,20 A3,3 0 1,1 340.01,20 M380,20 A3,3 0 1,1 380.01,20', w: 400, h: 40, fill: '#ffffff', stroke: 'none', strokeWidth: 0 },
    { id: 'svg-border-bracket-l', label: 'Left Bracket', path: 'M100,20 L40,20 Q20,20 20,40 L20,180 Q20,200 40,200 Q20,200 20,220 L20,360 Q20,380 40,380 L100,380', w: 120, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 3 },
    { id: 'svg-border-bracket-r', label: 'Right Bracket', path: 'M20,20 L80,20 Q100,20 100,40 L100,180 Q100,200 80,200 Q100,200 100,220 L100,360 Q100,380 80,380 L20,380', w: 120, h: 400, fill: 'transparent', stroke: '#ffffff', strokeWidth: 3 },
    { id: 'svg-border-wave', label: 'Wave Border', path: 'M0,20 Q50,0 100,20 Q150,40 200,20 Q250,0 300,20 Q350,40 400,20', w: 400, h: 40, fill: 'transparent', stroke: '#ffffff', strokeWidth: 2 },
  ]},
}
