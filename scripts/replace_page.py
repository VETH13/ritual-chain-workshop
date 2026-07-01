"""Replace lines 482-end of page.tsx with the contents of _page_section.tsx"""
import os

PAGE = "/home/z/my-project/src/app/page.tsx"
SECTION = "/home/z/my-project/scripts/_page_section.tsx"

with open(PAGE, "r") as f:
    lines = f.readlines()

with open(SECTION, "r") as f:
    new_content = f.read()

# Find the marker line
marker_idx = None
for i, line in enumerate(lines):
    if line.strip() == "/* ---------------- Start Screen ---------------- */":
        marker_idx = i
        break

if marker_idx is None:
    print("ERROR: marker not found")
    exit(1)

# Replace everything from marker_idx to end
new_lines = lines[:marker_idx] + [new_content]
with open(PAGE, "w") as f:
    f.writelines(new_lines)

print(f"Replaced lines {marker_idx + 1}-{len(lines)} with new section")
print(f"New file has {len(new_lines)} entries (one is the big new_content string)")
