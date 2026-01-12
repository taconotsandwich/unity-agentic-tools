import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('CLI', () => {
  describe('inspect command', () => {
    it('should output valid JSON', () => {
      const result = execSync('node dist/cli.js inspect test/fixtures/TestSample.unity TestObject --json', { encoding: 'utf-8' });
      const json = JSON.parse(result.toString());
      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('file_id');
      expect(json).toHaveProperty('active');
    });
  });

  describe('list command', () => {
    it('should list all GameObjects', () => {
      const result = execSync('node dist/cli.js list test/fixtures/TestSample.unity --json', { encoding: 'utf-8' });
      const json = JSON.parse(result.toString());
      expect(json).toHaveProperty('file');
      expect(json).toHaveProperty('count');
      expect(json).toHaveProperty('objects');
      expect(Array.isArray(json.objects)).toBe(true);
    });
  });

  describe('find command', () => {
    it('should find objects by name', () => {
      const result = execSync('npx tsx src/cli.ts find test/fixtures/SampleScene.unity Player --json', { encoding: 'utf-8' });
      const json = JSON.parse(result.toString());
      expect(json).toHaveProperty('file');
      expect(json).toHaveProperty('pattern');
      expect(json).toHaveProperty('matches');
      expect(json.matches.length).toBeGreaterThan(0);
    });
  });
});
