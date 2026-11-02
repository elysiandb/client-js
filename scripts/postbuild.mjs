// Marks each output folder with its module format, so that Node.js loads
// dist/esm as ES modules and dist/cjs as CommonJS whatever the root package.json says.
import { writeFileSync } from "node:fs";

writeFileSync(new URL("../dist/esm/package.json", import.meta.url), JSON.stringify({ type: "module" }) + "\n");
writeFileSync(new URL("../dist/cjs/package.json", import.meta.url), JSON.stringify({ type: "commonjs" }) + "\n");
