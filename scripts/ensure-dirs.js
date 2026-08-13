const fs = require("fs");
const path = require("path");

const dirs = [
  "data",
  "data/uploads",
  "data/exports",
  "data/covers",
  "public/fonts",
  "public/generated",
];

for (const d of dirs) {
  const p = path.join(process.cwd(), d);
  fs.mkdirSync(p, { recursive: true });
  const keep = path.join(p, ".gitkeep");
  if (!fs.existsSync(keep) && d.startsWith("data/")) {
    fs.writeFileSync(keep, "");
  }
}
