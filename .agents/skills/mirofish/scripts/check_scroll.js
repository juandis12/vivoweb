const fs = require('fs');

const css = fs.readFileSync('styles.css', 'utf8');

// Check all overflow rules
const lines = css.split('\n');
lines.forEach((line, i) => {
    if (line.includes('overflow-y') || line.includes('overflow: auto') || line.includes('overflow: scroll')) {
        console.log(`Line ${i + 1}: ${line.trim()}`);
    }
});
