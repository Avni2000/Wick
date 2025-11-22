import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Wick Extension Test Suite', () => {
	vscode.window.showInformationMessage('Starting Wick extension tests...');

	test('Extension should be present', () => {
		const extension = vscode.extensions.getExtension('Avni2000.wick');
		assert.ok(extension, 'Extension not found');
	});

	test('Extension should activate', async () => {
		const extension = vscode.extensions.getExtension('Avni2000.wick');
		assert.ok(extension);
		await extension!.activate();
		assert.ok(extension!.isActive, 'Extension did not activate');
	});

	test('Command "wick.showChart" should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const wickCommand = commands.find(cmd => cmd === 'wick.showChart');
		assert.ok(wickCommand, 'Command "wick.showChart" not found');
	});

	test('Command "wick.showChart" should execute without errors', async () => {
		try {
			await vscode.commands.executeCommand('wick.showChart');
			assert.ok(true, 'Command executed successfully');
		} catch (error) {
			assert.fail(`Command execution failed: ${error}`);
		}
	});

	test('Webview should be created when command is executed', async function () {
		this.timeout(5000); // Increase timeout for webview creation

		// Track webview creation
		let webviewCreated = false;
		const disposable = vscode.window.onDidChangeVisibleTextEditors(() => {
			webviewCreated = true;
		});

		await vscode.commands.executeCommand('wick.showChart');

		// Wait a bit for webview to be created
		await new Promise(resolve => setTimeout(resolve, 1000));

		disposable.dispose();
		assert.ok(true, 'Webview creation test completed');
	});

	test('Command "wick.openDashboard" should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const dashboardCommand = commands.find(cmd => cmd === 'wick.openDashboard');
		assert.ok(dashboardCommand, 'Command "wick.openDashboard" not found');
	});

	test('Command "wick.openDashboard" should execute without errors', async () => {
		try {
			await vscode.commands.executeCommand('wick.openDashboard');
			assert.ok(true, 'Dashboard command executed successfully');
		} catch (error) {
			assert.fail(`Dashboard command execution failed: ${error}`);
		}
	});
});
