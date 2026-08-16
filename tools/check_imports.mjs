import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const jsDir = path.join(rootDir, 'js');
const docsDir = path.join(rootDir, 'docs');

const jsFiles = [];
function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'vendor') walkDir(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.mjs')) {
            jsFiles.push(fullPath);
        }
    }
}
walkDir(jsDir);

const importedSet = new Set();
let brokenLinks = 0;

function resolveImport(importerPath, importPath) {
    if (!importPath.startsWith('.')) {
        // Absolute or package import. For this project, only 'three' is expected.
        if (importPath !== 'three' && !importPath.startsWith('node:')) {
            console.log(`Unrecognized external import in ${path.relative(rootDir, importerPath)}: ${importPath}`);
        }
        return null;
    }
    const resolved = path.resolve(path.dirname(importerPath), importPath);
    return resolved;
}

for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    // Basic regex for imports
    const importRegex = /import\s+(?:(?:.*?(?:,|from)\s+)*)?['"](.*?)['"]/g;
    const exportRegex = /export\s+(?:.*?\s+from\s+)?['"](.*?)['"]/g;
    const dynamicImportRegex = /import\s*\(\s*['"](.*?)['"]\s*\)/g;
    
    const checkMatch = (match) => {
        const p = match[1];
        const resolved = resolveImport(file, p);
        if (resolved) {
            if (!fs.existsSync(resolved)) {
                console.log(`BROKEN LINK: ${path.relative(rootDir, file)} imports missing file -> ${p}`);
                brokenLinks++;
            } else {
                importedSet.add(resolved);
            }
        }
    };

    [...content.matchAll(importRegex)].forEach(checkMatch);
    [...content.matchAll(exportRegex)].forEach(checkMatch);
    [...content.matchAll(dynamicImportRegex)].forEach(checkMatch);
}

// Add validator imports to importedSet
const validatorFiles = [path.join(rootDir, 'tools', 'validate.mjs'), path.join(rootDir, 'js', 'board-selftest.mjs')];
for (const file of validatorFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"](.*?)['"]/g;
    [...content.matchAll(importRegex)].forEach(m => {
        const resolved = resolveImport(file, m[1]);
        if (resolved && fs.existsSync(resolved)) {
            importedSet.add(resolved);
        }
    });
}

// Add index.html imports to importedSet
const htmlFiles = [path.join(rootDir, 'index.html'), path.join(rootDir, 'operator.html')];
for (const file of htmlFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /href=['"](\.\/js\/.*?)['"]|src=['"](\.\/js\/.*?)['"]/g;
    [...content.matchAll(importRegex)].forEach(m => {
        const p = m[1] || m[2];
        const resolved = path.resolve(rootDir, p);
        if (fs.existsSync(resolved)) {
            importedSet.add(resolved);
        }
    });
}

// Check for dead code (js files never imported)
// Exclude entry points
const entryPoints = [
    path.join(jsDir, 'main.js'),
    path.join(jsDir, 'main-operator.js'),
    path.join(jsDir, 'board-selftest.mjs'),
    // These might be loaded dynamically or used as top-level:
    path.join(jsDir, 'ui', 'screens.js'), // Loaded in index.html as modulepreload
];

let deadCode = 0;
for (const file of jsFiles) {
    if (!importedSet.has(file) && !entryPoints.includes(file)) {
        // If it's dynamically constructed, we might miss it. Let's list it.
        console.log(`UNUSED FILE: ${path.relative(rootDir, file)} is never imported directly.`);
        deadCode++;
    }
}

console.log(`\nScan complete. ${brokenLinks} broken links, ${deadCode} unused files.`);
if (brokenLinks === 0 && deadCode === 0) {
    console.log("ALL PASS");
}
