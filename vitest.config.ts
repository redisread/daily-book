import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plugin to handle ?raw imports for YAML files in tests
function yamlRawPlugin() {
  return {
    name: 'yaml-raw',
    resolveId(id: string) {
      if (id.endsWith('.yaml?raw')) {
        return id;
      }
      return null;
    },
    load(id: string) {
      if (id.endsWith('.yaml?raw')) {
        const filePath = id.replace('?raw', '');
        const content = readFileSync(filePath, 'utf8');
        return `export default ${JSON.stringify(content)}`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [yamlRawPlugin()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
