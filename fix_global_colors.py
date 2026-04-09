import re
import glob
import os

files = glob.glob("frontend/src/pages/*.jsx") + glob.glob("frontend/src/components/*.jsx") + glob.glob("frontend/src/components/**/*.jsx", recursive=True)

for file_path in files:
    with open(file_path, "r") as f:
        lines = f.readlines()

    new_lines = []
    for line in lines:
        # Don't touch text-white if the element has our primary accent colors which need white text even in light mode
        has_primary_bg = re.search(r'bg-primary|btn-primary|bg-\[\#FF4D00\]|bg-\[var\(--sys-primary\)\]', line)
        
        new_line = line
        
        if not has_primary_bg:
            new_line = re.sub(r'\btext-white\b', 'text-[var(--sys-text)]', new_line)
            
        new_line = re.sub(r'\btext-slate-2[0-9]{2}\b', 'text-[var(--sys-text)]', new_line)
        new_line = re.sub(r'\btext-slate-[3-6][0-9]{2}\b', 'text-[var(--sys-text-muted)]', new_line)
        new_line = re.sub(r'\bbg-slate-[3-6][0-9]{2}\b', 'bg-[var(--sys-border)]', new_line)
        new_line = re.sub(r'\bbg-slate-[7-9][0-9]{2}\b', 'bg-[var(--sys-surface)]', new_line)

        new_lines.append(new_line)

    with open(file_path, "w") as f:
        f.writelines(new_lines)

print(f"Processed {len(files)} files!")
