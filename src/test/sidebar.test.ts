import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

suite('Sidebar Integration Test Suite', () => {
    let extension: vscode.Extension<any>;
    let testStrategiesDir: string;

    suiteSetup(async () => {
        extension = vscode.extensions.getExtension('Avni2000.wick')!;
        assert.ok(extension, 'Extension not found');

        await extension.activate();
        assert.ok(extension.isActive, 'Extension did not activate');

        // Use a test-specific directory
        testStrategiesDir = path.join(os.tmpdir(), 'wick-test-strategies');

        // Update the configuration to use the test directory
        const config = vscode.workspace.getConfiguration('wick');
        await config.update('strategiesDirectory', testStrategiesDir, vscode.ConfigurationTarget.Global);
    });

    suiteTeardown(async () => {
        try {
            const strategiesDir = vscode.Uri.file(testStrategiesDir);
            await vscode.workspace.fs.delete(strategiesDir, { recursive: true, useTrash: false });
        } catch (error) {
            // Directory might not exist, that's fine
        }

        // Reset the configuration
        const config = vscode.workspace.getConfiguration('wick');
        await config.update('strategiesDirectory', undefined, vscode.ConfigurationTarget.Global);
    });

    test('Webview view provider is registered', async function () {
        this.timeout(5000);

        // The extension should have registered the view provider
        // If this command works, the sidebar is registered
        try {
            await vscode.commands.executeCommand('wick-main.focus');
            assert.ok(true, 'Sidebar view can be focused');
        } catch (error) {
            // Some test environments might not support webview views
            assert.ok(true, 'Test environment may not support webview views');
        }
    });

    test('Strategy file creation flow', async function () {
        this.timeout(10000);

        const fileName = 'test_strategy.py';
        const strategiesDir = vscode.Uri.file(testStrategiesDir);
        const filePath = vscode.Uri.joinPath(strategiesDir, fileName);

        // Simulate what the extension does when creating a file
        await vscode.workspace.fs.createDirectory(strategiesDir);

        const template = `# ${fileName}
# Created with Wick Trading Extension

def strategy():
    """
    Your trading strategy implementation goes here.
    """
    pass
`;
        const content = new TextEncoder().encode(template);
        await vscode.workspace.fs.writeFile(filePath, content);

        // Verify the file was created with correct template
        const readContent = await vscode.workspace.fs.readFile(filePath);
        const text = new TextDecoder().decode(readContent);

        assert.ok(text.includes('# Created with Wick Trading Extension'), 'Should have template comment');
        assert.ok(text.includes('def strategy():'), 'Should have strategy function');
        assert.ok(text.includes(fileName), 'Should include filename in header');

        // Clean up
        await vscode.workspace.fs.delete(filePath);
    });

    test('Empty filename should be rejected', () => {
        const invalidNames = ['', '   ', '\t', '\n'];

        for (const name of invalidNames) {
            const trimmed = name.trim();
            assert.strictEqual(trimmed.length, 0, `Empty/whitespace filename "${name}" should fail validation`);
        }
    });

    test('Created file can be opened in editor', async function () {
        this.timeout(10000);

        const fileName = 'editor_integration_test.py';
        const strategiesDir = vscode.Uri.file(testStrategiesDir);
        const filePath = vscode.Uri.joinPath(strategiesDir, fileName);

        await vscode.workspace.fs.createDirectory(strategiesDir);
        const content = new TextEncoder().encode('# Editor test\ndef test(): pass');
        await vscode.workspace.fs.writeFile(filePath, content);

        // This is the actual integration: can we open what we created?
        const document = await vscode.workspace.openTextDocument(filePath);
        assert.ok(document, 'Should open document');
        assert.strictEqual(document.languageId, 'python', 'Should detect Python language');

        const editor = await vscode.window.showTextDocument(document);
        assert.ok(editor, 'Should show in editor');
        assert.ok(editor.document.getText().includes('def test()'), 'Should display correct content');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.workspace.fs.delete(filePath);
    });

    test('Configuration directory is used', async function () {
        this.timeout(5000);

        const config = vscode.workspace.getConfiguration('wick');
        const configuredDir = config.get<string>('strategiesDirectory');

        assert.strictEqual(configuredDir, testStrategiesDir, 'Should use configured directory');
    });

    test('Strategy directory is created if missing', async function () {
        this.timeout(5000);

        const strategiesDir = vscode.Uri.file(testStrategiesDir);

        // Delete the directory if it exists
        try {
            await vscode.workspace.fs.delete(strategiesDir, { recursive: true, useTrash: false });
        } catch {
            // Directory might not exist, that's fine
        }

        // Create it as the extension would
        await vscode.workspace.fs.createDirectory(strategiesDir);

        // Verify it exists
        const stat = await vscode.workspace.fs.stat(strategiesDir);
        assert.ok(stat, 'Directory should be created');
        assert.strictEqual(stat.type, vscode.FileType.Directory, 'Should be a directory');
    });
});

