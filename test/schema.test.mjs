import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, handleToolCall } from '../lib/tools.mjs';

const stubGsc = {
  listSites: async () => [],
  searchAnalytics: async () => ({ rows: [] }),
  inspectUrl: async () => ({ inspectionResult: {} }),
  listSitemaps: async () => [],
};

const BASE = {
  site: 'sc-domain:example.com',
  url: 'https://example.com/a/',
  urls: ['https://example.com/a/'],
};

function baseArgs(tool) {
  const args = {};
  for (const key of tool.inputSchema.required ?? []) args[key] = BASE[key];
  return args;
}

function violations(schema) {
  const out = [];
  if (typeof schema.minimum === 'number') out.push(schema.minimum - 1);
  if (typeof schema.exclusiveMinimum === 'number') out.push(schema.exclusiveMinimum);
  if (typeof schema.maximum === 'number') out.push(schema.maximum + 1);
  if (schema.minItems === 1) out.push([]);
  if (schema.pattern) out.push('not-a-date');
  return out;
}

for (const tool of TOOLS) {
  const props = Object.entries(tool.inputSchema.properties ?? {});
  for (const [name, schema] of props) {
    for (const bad of violations(schema)) {
      test(`${tool.name}: rejects ${name}=${JSON.stringify(bad)}`, async () => {
        const res = await handleToolCall(tool.name, { ...baseArgs(tool), [name]: bad }, stubGsc);
        assert.equal(res.isError, true, `${name}=${JSON.stringify(bad)} violates the schema but was accepted`);
      });
    }
  }
}

test('every enum in a schema is a non-empty array of strings', () => {
  for (const tool of TOOLS) {
    for (const [name, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
      const enums = [schema.enum, schema.items?.enum].filter(Boolean);
      for (const e of enums) {
        assert.ok(Array.isArray(e) && e.length > 0, `${tool.name}.${name} has an empty enum`);
        assert.ok(e.every((v) => typeof v === 'string'), `${tool.name}.${name} has a non-string enum value`);
      }
    }
  }
});
