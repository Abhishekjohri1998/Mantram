import re
import glob

file_paths = glob.glob("frontend/src/components/seo/*.jsx")
for file_path in file_paths:
    with open(file_path, "r") as f:
        content = f.read()

    # Replacements
    content = re.sub(r'\btext-white\b', 'text-[var(--sys-text)]', content)
    content = re.sub(r'\btext-slate-2[0-9]{2}\b', 'text-[var(--sys-text)]', content)
    content = re.sub(r'\btext-slate-[3-6][0-9]{2}\b', 'text-[var(--sys-text-muted)]', content)
    content = re.sub(r'\bbg-slate-[3-6][0-9]{2}\b', 'bg-[var(--sys-border)]', content)

    with open(file_path, "w") as f:
        f.write(content)

print(f"Replaced {len(file_paths)} files!")
