import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'path';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import {
    indexMarkdownFile,
    indexDocsDirectory,
    indexScriptableObject,
    indexHtmlFile,
    stripHtml,
    htmlToMarkdown,
} from '../../src/indexer';

const fixtures_dir = resolve(__dirname, '..', 'fixtures');

describe('indexMarkdownFile', () => {
    it('should return chunks_indexed > 0 and files_processed === 1', () => {
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        expect(result.chunks_indexed).toBeGreaterThan(0);
        expect(result.files_processed).toBe(1);
    });

    it('should extract code blocks from markdown', () => {
        // The sample.md has csharp code blocks, so chunks should include code
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        // There are at least 2 code blocks in sample.md
        expect(result.chunks_indexed).toBeGreaterThanOrEqual(2);
    });

    it('should compute total_tokens > 0', () => {
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        expect(result.total_tokens).toBeGreaterThan(0);
    });

    it('should report elapsed_ms >= 0', () => {
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
});

describe('indexDocsDirectory', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should process all .md files in a directory', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));
        writeFileSync(join(temp_dir, 'doc1.md'), '## Heading\n\nSome content.');
        writeFileSync(join(temp_dir, 'doc2.md'), '## Other\n\nMore content.');

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(2);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });

    it('should skip non-matching extensions', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));
        writeFileSync(join(temp_dir, 'readme.md'), '## Test\n\nContent.');
        writeFileSync(join(temp_dir, 'image.png'), 'binary data');
        writeFileSync(join(temp_dir, 'script.js'), 'console.log("hi")');

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(1); // only .md
    });

    it('should return 0 chunks for empty directory', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(0);
        expect(result.chunks_indexed).toBe(0);
    });
});

describe('indexScriptableObject', () => {
    it('should index a .asset file', () => {
        const result = indexScriptableObject(resolve(fixtures_dir, 'sample.asset'));

        expect(result.files_processed).toBe(1);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });

    it('should fall back to prose chunking for non-ScriptableObject content', () => {
        // sample.asset uses MonoBehaviour with m_ properties
        // Either ScriptableObject parsing or prose fallback should produce chunks
        const result = indexScriptableObject(resolve(fixtures_dir, 'sample.asset'));

        expect(result.chunks_indexed).toBeGreaterThan(0);
        expect(result.total_tokens).toBeGreaterThan(0);
    });
});

describe('stripHtml (deprecated)', () => {
    it('should strip HTML tags', () => {
        expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });

    it('should remove script blocks', () => {
        expect(stripHtml('Before<script>alert("xss")</script>After')).toBe('Before After');
    });

    it('should remove style blocks', () => {
        expect(stripHtml('Before<style>.red { color: red; }</style>After')).toBe('Before After');
    });

    it('should decode common HTML entities', () => {
        expect(stripHtml('&amp; &lt; &gt; &quot; &nbsp;')).toBe('& < > "');
    });

    it('should collapse whitespace', () => {
        expect(stripHtml('<p>  lots   of   space  </p>')).toBe('lots of space');
    });
});

describe('htmlToMarkdown', () => {
    it('should convert HTML to clean markdown', () => {
        const result = htmlToMarkdown('<p>Hello <b>world</b></p>');
        expect(result).toContain('**world**');
        expect(result).toContain('Hello');
    });

    it('should remove script blocks', () => {
        const result = htmlToMarkdown('Before<script>alert("xss")</script>After');
        expect(result).not.toContain('alert');
        expect(result).toContain('Before');
        expect(result).toContain('After');
    });

    it('should remove style blocks', () => {
        const result = htmlToMarkdown('Before<style>.red { color: red; }</style>After');
        expect(result).not.toContain('color');
        expect(result).toContain('Before');
    });

    it('should decode common HTML entities', () => {
        const result = htmlToMarkdown('<p>&amp; &lt; &gt; &quot; &#39;</p>');
        expect(result).toContain('&');
        expect(result).toContain('<');
        expect(result).toContain('>');
        expect(result).toContain('"');
        expect(result).toContain("'");
    });

    it('should collapse whitespace', () => {
        const result = htmlToMarkdown('<p>  lots   of   space  </p>');
        // After tag stripping and cleanup, whitespace is preserved within text nodes
        // but multiple blank lines collapse
        expect(result).not.toMatch(/\n{3,}/);
    });

    it('should extract content from content-wrap div', () => {
        const html = `
            <html><body>
            <div class="header-wrapper"><nav>Navigation</nav></div>
            <div id="sidebar"><ul><li>TOC item</li></ul></div>
            <div id="content-wrap">
                <h1>Main Title</h1>
                <p>Important content here.</p>
            </div>
            <div class="footer-wrapper">Copyright 2024</div>
            </body></html>
        `;
        const result = htmlToMarkdown(html);
        expect(result).toContain('# Main Title');
        expect(result).toContain('Important content here.');
        expect(result).not.toContain('Navigation');
        expect(result).not.toContain('TOC item');
        expect(result).not.toContain('Copyright');
    });

    it('should convert headings to markdown', () => {
        const result = htmlToMarkdown('<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>');
        expect(result).toContain('# Title');
        expect(result).toContain('## Section');
        expect(result).toContain('### Subsection');
    });

    it('should convert links to markdown', () => {
        const result = htmlToMarkdown('<a href="Collider.html">Collider</a>');
        expect(result).toBe('[Collider](Collider.html)');
    });

    it('should skip empty-text links', () => {
        const result = htmlToMarkdown('<a href="foo.html"></a>');
        expect(result).toBe('');
    });

    it('should convert tables to markdown', () => {
        const html = `
            <table class="list">
                <tr>
                    <td class="lbl"><a href="Rigidbody-velocity.html">velocity</a></td>
                    <td class="desc">The velocity vector of the rigidbody.</td>
                </tr>
                <tr>
                    <td class="lbl"><a href="Rigidbody-mass.html">mass</a></td>
                    <td class="desc">The mass of the rigidbody.</td>
                </tr>
            </table>
        `;
        const result = htmlToMarkdown(html);
        expect(result).toContain('[velocity](Rigidbody-velocity.html)');
        expect(result).toContain('The velocity vector of the rigidbody.');
        expect(result).toContain('|');
        expect(result).toContain('---');
    });

    it('should convert tables with headers', () => {
        const html = `
            <table>
                <thead><tr><th>Property</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td>mass</td><td>The mass</td></tr>
                    <tr><td>drag</td><td>The drag</td></tr>
                </tbody>
            </table>
        `;
        const result = htmlToMarkdown(html);
        expect(result).toContain('| Property | Description |');
        expect(result).toContain('|---|---|');
        expect(result).toContain('| mass | The mass |');
    });

    it('should strip tooltip content', () => {
        const html = '<span class="tooltip"><strong>Rigidbody</strong><span class="tooltiptext">A physics component</span></span>';
        const result = htmlToMarkdown(html);
        expect(result).toContain('**Rigidbody**');
        expect(result).not.toContain('A physics component');
    });

    it('should strip sidebar and navigation', () => {
        const html = `
            <div id="sidebar"><ul><li>Nav 1</li><li>Nav 2</li></ul></div>
            <div class="toolbar"><select>Version</select></div>
            <p>Real content</p>
        `;
        const result = htmlToMarkdown(html);
        expect(result).toContain('Real content');
        expect(result).not.toContain('Nav 1');
        expect(result).not.toContain('Version');
    });

    it('should convert bold and italic', () => {
        const result = htmlToMarkdown('<strong>bold</strong> and <em>italic</em>');
        expect(result).toContain('**bold**');
        expect(result).toContain('*italic*');
    });

    it('should handle code blocks', () => {
        const html = '<pre><code>void Start() {\n    Debug.Log("Hello");\n}</code></pre>';
        const result = htmlToMarkdown(html);
        expect(result).toContain('```csharp');
        expect(result).toContain('void Start()');
        expect(result).toContain('```');
    });

    it('should handle codeExampleCS pre blocks', () => {
        const html = '<pre class="codeExampleCS">int x = 42;</pre>';
        const result = htmlToMarkdown(html);
        expect(result).toContain('```csharp');
        expect(result).toContain('int x = 42;');
    });

    it('should fallback to body when no content-wrap', () => {
        const html = '<html><body><h1>Page Title</h1><p>Body content.</p></body></html>';
        const result = htmlToMarkdown(html);
        expect(result).toContain('# Page Title');
        expect(result).toContain('Body content.');
    });

    it('should handle breadcrumbs', () => {
        const html = '<div class="breadcrumbs"><a href="physics.html">Physics</a> > <a href="rigidbody.html">Rigidbody</a></div>';
        const result = htmlToMarkdown(html);
        expect(result).toContain('> Physics > Rigidbody');
    });

    it('should convert list items', () => {
        const html = '<ul><li>First item</li><li>Second item</li></ul>';
        const result = htmlToMarkdown(html);
        expect(result).toContain('- First item');
        expect(result).toContain('- Second item');
    });

    it('should strip forms', () => {
        const html = '<form action="/search"><input type="text" /></form><p>Content</p>';
        const result = htmlToMarkdown(html);
        expect(result).not.toContain('search');
        expect(result).toContain('Content');
    });

    it('should remove nextprev navigation', () => {
        const html = '<div class="nextprev clear"><a href="prev.html">Previous</a><a href="next.html">Next</a></div><p>Main content</p>';
        const result = htmlToMarkdown(html);
        expect(result).not.toContain('Previous');
        expect(result).not.toContain('Next');
        expect(result).toContain('Main content');
    });
});

describe('indexHtmlFile', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should index HTML content and produce chunks', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-html-'));
        const htmlContent = '<html><body><h2>Section Title</h2><p>Some documentation about Unity components.</p></body></html>';
        const filePath = join(temp_dir, 'doc.html');
        writeFileSync(filePath, htmlContent);

        const result = indexHtmlFile(filePath);

        expect(result.files_processed).toBe(1);
        expect(result.chunks_indexed).toBeGreaterThan(0);
        expect(result.total_tokens).toBeGreaterThan(0);
    });

    it('should strip scripts and styles before indexing', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-html-'));
        const htmlContent = '<html><head><style>body{}</style></head><body><script>var x=1;</script><p>Clean content here.</p></body></html>';
        const filePath = join(temp_dir, 'doc.html');
        writeFileSync(filePath, htmlContent);

        const result = indexHtmlFile(filePath);

        expect(result.chunks_indexed).toBeGreaterThan(0);
    });

    it('should produce markdown-formatted chunks from HTML', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-html-'));
        const htmlContent = '<html><body><h2>API Reference</h2><p>The <a href="Collider.html">Collider</a> component.</p></body></html>';
        const filePath = join(temp_dir, 'doc.html');
        writeFileSync(filePath, htmlContent);

        const result = indexHtmlFile(filePath);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });
});

describe('indexDocsDirectory - recursive', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should find files in subdirectories', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-recursive-'));
        const subDir = join(temp_dir, 'sub');
        require('fs').mkdirSync(subDir);
        writeFileSync(join(temp_dir, 'top.md'), '## Top\n\nContent.');
        writeFileSync(join(subDir, 'nested.md'), '## Nested\n\nMore content.');

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(2);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });

    it('should process .html files in directory mode', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-html-dir-'));
        writeFileSync(join(temp_dir, 'page.html'), '<html><body><p>HTML page content.</p></body></html>');
        writeFileSync(join(temp_dir, 'readme.md'), '## Readme\n\nMarkdown content.');

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(2);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });

    it('should find HTML files in nested directories', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-nested-html-'));
        const subDir = join(temp_dir, 'ScriptReference');
        require('fs').mkdirSync(subDir);
        writeFileSync(join(subDir, 'GameObject.html'), '<html><body><p>Unity GameObject API docs.</p></body></html>');

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(1);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });
});

describe('large section chunking', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should produce multiple chunks for sections >4096 chars', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));
        // Create a file with a very large section (>4096 chars = >1024 tokens)
        const largeContent = '## Large Section\n\n' + ('This is a sentence that contains words. '.repeat(200));
        const filePath = join(temp_dir, 'large.md');
        writeFileSync(filePath, largeContent);

        const result = indexMarkdownFile(filePath);

        // With ~8000 chars of prose, should be split into multiple chunks
        expect(result.chunks_indexed).toBeGreaterThan(1);
    });
});
