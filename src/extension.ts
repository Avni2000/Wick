import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

console.log('Wick extension file is being loaded!');

// Types for candle data
export type Candle = {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number
};

// Sidebar View Provider
class WickViewProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _fileWatcher?: vscode.FileSystemWatcher;

	constructor(
		private readonly _extensionUri: vscode.Uri
	) {
		console.log('WickViewProvider instantiated');
	}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		console.log('Resolving webview view for wick-main');
		webviewView.webview.html = await this.getSidebarContent(webviewView.webview);
		console.log('Webview HTML set successfully');

		// Send initial file list to the webview
		await this.sendFileList();

		// Set up file watcher for the strategies directory
		await this.setupFileWatcher();

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async message => {
			switch (message.command) {
				case 'showChart':
					vscode.commands.executeCommand('wick.showChart');
					break;
				case 'requestAddStrategy':
					await this.promptAndCreateStrategy();
					break;
				case 'requestFileList':
					await this.sendFileList();
					break;
				case 'showStrategyBuilder':
					vscode.commands.executeCommand('wick.showStrategyBuilder');
					break;
			}
		});
	}

	private async getStrategiesDirectory(): Promise<vscode.Uri> {
		const config = vscode.workspace.getConfiguration('wick');
		let dirPath = config.get<string>('strategiesDirectory', '~/source/repos/strategies');

		// Expand tilde to home directory
		if (dirPath.startsWith('~/')) {
			const homeDir = process.env.HOME || process.env.USERPROFILE;
			if (homeDir) {
				dirPath = dirPath.replace('~', homeDir);
			}
		}

		return vscode.Uri.file(dirPath);
	}

	private async setupFileWatcher(): Promise<void> {
		try {
			const strategiesDir = await this.getStrategiesDirectory();
			const pattern = new vscode.RelativePattern(strategiesDir.fsPath, '*.py');

			this._fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

			this._fileWatcher.onDidCreate(() => this.sendFileList());
			this._fileWatcher.onDidDelete(() => this.sendFileList());
			this._fileWatcher.onDidChange(() => this.sendFileList());

			console.log('File watcher set up for:', strategiesDir.fsPath);
		} catch (error) {
			console.error('Failed to set up file watcher:', error);
		}
	}

	private async sendFileList(): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			const strategiesDir = await this.getStrategiesDirectory();

			// Ensure directory exists
			try {
				await vscode.workspace.fs.createDirectory(strategiesDir);
			} catch (error) {
				// Directory might already exist
			}

			// List all .py files
			const files = await vscode.workspace.fs.readDirectory(strategiesDir);
			const pyFiles = files
				.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.py'))
				.map(([name]) => name)
				.sort();

			this._view.webview.postMessage({
				type: 'fileList',
				files: pyFiles
			});

			console.log('Sent file list to webview:', pyFiles);
		} catch (error) {
			console.error('Failed to send file list:', error);
		}
	}

	private async promptAndCreateStrategy(): Promise<void> {
		const fileName = await vscode.window.showInputBox({
			prompt: 'Enter strategy file name',
			placeHolder: 'custom_strategy.py',
			validateInput: (value) => {
				if (!value || !value.trim()) {
					return 'Filename cannot be empty';
				}
				if (!value.endsWith('.py')) {
					return 'Filename must end with .py';
				}
				return null;
			}
		});

		if (fileName) {
			await this.createStrategyFile(fileName.trim());
		}
	}

	private async createStrategyFile(fileName: string): Promise<void> {
		try {
			// Validate filename
			if (!fileName || !fileName.trim()) {
				vscode.window.showErrorMessage('Wick: Filename cannot be empty');
				return;
			}

			const trimmedName = fileName.trim();

			// Get strategies directory
			const strategiesDir = await this.getStrategiesDirectory();

			// Ensure strategies directory exists
			try {
				await vscode.workspace.fs.createDirectory(strategiesDir);
			} catch (error) {
				// Directory might already exist, that's fine
			}

			// Create the file path
			const filePath = vscode.Uri.joinPath(strategiesDir, trimmedName);

			// Check if file already exists
			try {
				await vscode.workspace.fs.stat(filePath);
				vscode.window.showWarningMessage(`Wick: File "${trimmedName}" already exists`);
				return;
			} catch {
				// File doesn't exist, proceed with creation
			}

			// Create the file with a basic template
			const template = `# ${trimmedName}
# Created with Wick Trading Extension

def strategy():
    """
    Your trading strategy implementation goes here.
    """
    pass
`;
			const content = new TextEncoder().encode(template);
			await vscode.workspace.fs.writeFile(filePath, content);

			// Show success message
			vscode.window.showInformationMessage(`Wick: Created "${trimmedName}"`);

			// Open the file in the editor
			const document = await vscode.workspace.openTextDocument(filePath);
			await vscode.window.showTextDocument(document);

			console.log(`Created strategy file: ${filePath.fsPath}`);

			// File list will be updated automatically by the file watcher
		} catch (error: any) {
			console.error('Failed to create strategy file:', error);
			vscode.window.showErrorMessage(`Wick: Failed to create file - ${error.message}`);
		}
	}

	private async getSidebarContent(webview: vscode.Webview): Promise<string> {
		try {
			const uri = vscode.Uri.joinPath(this._extensionUri, 'dist', 'views', 'sidebar.html');
			console.log('Loading sidebar from:', uri.toString());
			const uint8Array = await vscode.workspace.fs.readFile(uri);
			const content = new TextDecoder().decode(uint8Array);
			console.log('Sidebar content loaded, length:', content.length);
			return content;
		} catch (error) {
			console.error('Failed to load sidebar content:', error);
			// Return a fallback HTML in case of error
			return `<!DOCTYPE html>
<html>
<head><title>Wick Trading</title></head>
<body>
	<h3>Wick Trading</h3>
	<p>Error loading sidebar: ${error}</p>
	<button onclick="acquireVsCodeApi().postMessage({command: 'showChart'})">Open Chart</button>
	<script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
		}
	}

	public dispose(): void {
		this._fileWatcher?.dispose();
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "wick" is now active!');

	// Register the sidebar view provider
	const provider = new WickViewProvider(context.extensionUri);
	console.log('Registering webview view provider for wick-main');
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wick-main', provider, {
			webviewOptions: {
				retainContextWhenHidden: true
			}
		})
	);
	console.log('Webview view provider registered successfully');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// Store panel references
	let chartPanel: vscode.WebviewPanel | undefined = undefined;
	let strategyBuilderPanel: vscode.WebviewPanel | undefined = undefined;

	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('wick.showChart', async () => {
		// If panel already exists, reveal it
		if (chartPanel) {
			chartPanel.reveal(vscode.ViewColumn.One);
			return;
		}

		// Create and show a new webview panel
		chartPanel = vscode.window.createWebviewPanel(
			'wickChart', // Identifies the type of the webview. Used internally
			'Wick Chart', // Title of the panel displayed to the user
			vscode.ViewColumn.One, // Editor column to show the new webview panel in.
			{
				enableScripts: true // Enable scripts in the webview
			}
		);

		// Handle panel disposal
		chartPanel.onDidDispose(() => {
			chartPanel = undefined;
		}, null, context.subscriptions);

		// Set the webview's HTML content
		chartPanel.webview.html = await getWebviewContent('GOOGL', context.extensionUri);

		// Handle messages from the webview (for fetching data)
		chartPanel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'fetchStockData':
						try {
							const range = message.range || '5y';
							const interval = message.interval || '1d';
							const candles = await fetchYahooCandles(
								message.ticker,
								range,
								interval
							);
							chartPanel?.webview.postMessage({
								type: 'candles',
								symbol: message.ticker,
								range: range,
								interval: interval,
								candles: candles
							});
						} catch (error: any) {
							chartPanel?.webview.postMessage({
								type: 'error',
								message: error.message
							});
						}
						break;
					case 'chartState':
						// Forward to Strategy Builder if it exists
						if (strategyBuilderPanel) {
							strategyBuilderPanel.webview.postMessage({
								type: 'chartState',
								ticker: message.ticker,
								start: message.start,
								end: message.end
							});
						}
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	// Register command to manually focus the sidebar
	context.subscriptions.push(
		vscode.commands.registerCommand('wick.focusSidebar', async () => {
			console.log('Executing wick.focusSidebar command');
			await vscode.commands.executeCommand('wick-main.focus');
		})
	);

	// Register strategy builder command
	context.subscriptions.push(
		vscode.commands.registerCommand('wick.showStrategyBuilder', async () => {
			// If panel already exists, reveal it
			if (strategyBuilderPanel) {
				strategyBuilderPanel.reveal(vscode.ViewColumn.Beside);
				return;
			}

			strategyBuilderPanel = vscode.window.createWebviewPanel(
				'wickStrategyBuilder',
				'Strategy Builder',
				vscode.ViewColumn.Beside, // Open beside the current editor (Split Screen)
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

			// Handle panel disposal
			strategyBuilderPanel.onDidDispose(() => {
				strategyBuilderPanel = undefined;
			}, null, context.subscriptions);

			// Set the webview's HTML content
			strategyBuilderPanel.webview.html = await getStrategyBuilderContent(context.extensionUri);

			// Handle messages from the webview
			strategyBuilderPanel.webview.onDidReceiveMessage(
				async message => {
					switch (message.command) {
						case 'runBacktest':
							try {
								const results = await runBacktest(message.config, context.extensionUri);
								strategyBuilderPanel?.webview.postMessage({
									type: 'backtestResults',
									results: results
								});
							} catch (error: any) {
								strategyBuilderPanel?.webview.postMessage({
									type: 'backtestError',
									error: error.message
								});
							}
							break;
						case 'requestChartState':
							// Forward to Chart if it exists
							if (chartPanel) {
								chartPanel.webview.postMessage({
									type: 'requestChartState'
								});
							}
							break;
					}
				},
				undefined,
				context.subscriptions
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('wick.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'wick');
		})
	);

	context.subscriptions.push(disposable);
}

async function getWebviewContent(ticker: string, extensionUri: vscode.Uri): Promise<string> {
	const uri = vscode.Uri.joinPath(extensionUri, 'dist', 'views', 'chart.html');
	const uint8Array = await vscode.workspace.fs.readFile(uri);
	const template = new TextDecoder().decode(uint8Array);
	return template
		.replace('{{ticker}}', ticker) // Replace title (no quotes needed)
		.replace('{{ ticker }}', JSON.stringify(ticker)); // Replace JS variable (needs quotes)
}

async function getStrategyBuilderContent(extensionUri: vscode.Uri): Promise<string> {
	const uri = vscode.Uri.joinPath(extensionUri, 'dist', 'views', 'strategy-builder.html');
	const uint8Array = await vscode.workspace.fs.readFile(uri);
	return new TextDecoder().decode(uint8Array);
}



async function runBacktest(config: any, extensionUri: vscode.Uri): Promise<any> {
	return new Promise(async (resolve, reject) => {
		try {
			// Ensure Python environment is set up
			const pythonPath = await ensurePythonEnvironment();

			// Path to backtest_runner.py
			const scriptPath = vscode.Uri.joinPath(extensionUri, 'python', 'backtest_runner.py').fsPath;

			console.log(`Running backtest with Python: ${pythonPath}`);
			console.log(`Script path: ${scriptPath}`);

			// Spawn Python process
			const pythonProcess = spawn(pythonPath, [scriptPath]);

			let stdout = '';
			let stderr = '';

			pythonProcess.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			pythonProcess.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			pythonProcess.on('close', (code) => {
				console.log(`Python process exited with code ${code}`);
				console.log('Stdout:', stdout);
				console.log('Stderr:', stderr);

				// Try to parse stdout regardless of exit code, as errors may be in JSON format
				try {
					const result = JSON.parse(stdout);

					// Check if result contains an error
					if (result.error) {
						console.error('Python script returned error:', result.error);
						if (result.traceback) {
							console.error('Traceback:', result.traceback);
						}
						reject(new Error(result.error));
					} else {
						resolve(result);
					}
				} catch (error: any) {
					// If we can't parse JSON and exit code is non-zero, use stderr
					if (code !== 0) {
						console.error(`Python process exited with code ${code}`);
						console.error('Stderr:', stderr);
						reject(new Error(stderr || `Python process exited with code ${code}`));
					} else {
						console.error('Failed to parse JSON output:', stdout);
						reject(new Error(`Failed to parse backtest results: ${error.message}\n\nOutput: ${stdout}`));
					}
				}
			});

			pythonProcess.on('error', (error) => {
				console.error('Failed to start Python process:', error);
				reject(new Error(`Failed to start Python: ${error.message}. Make sure Python 3 is installed.`));
			});

			// Send config to Python via stdin
			pythonProcess.stdin.write(JSON.stringify(config));
			pythonProcess.stdin.end();

		} catch (error: any) {
			reject(error);
		}
	});
}

async function ensurePythonEnvironment(): Promise<string> {
	const config = vscode.workspace.getConfiguration('wick');
	let strategiesDir = config.get<string>('strategiesDirectory', '~/source/repos/strategies');

	// Expand tilde
	if (strategiesDir.startsWith('~/')) {
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		strategiesDir = strategiesDir.replace('~', homeDir);
	}

	// Ensure strategies directory exists
	if (!fs.existsSync(strategiesDir)) {
		fs.mkdirSync(strategiesDir, { recursive: true });
	}

	const venvPath = path.join(strategiesDir, '.venv');
	const isWindows = process.platform === 'win32';
	const pythonExecutable = isWindows
		? path.join(venvPath, 'Scripts', 'python.exe')
		: path.join(venvPath, 'bin', 'python');

	const pipExecutable = isWindows
		? path.join(venvPath, 'Scripts', 'pip.exe')
		: path.join(venvPath, 'bin', 'pip');

	// Check if venv exists
	if (!fs.existsSync(pythonExecutable)) {
		console.log(`Python venv not found at: ${pythonExecutable}`);
		const selection = await vscode.window.showInformationMessage(
			'Wick requires a Python environment for backtesting. Would you like to create one now? (This will install backtesting, yfinance, pandas, and numpy)',
			{ modal: true },
			'Create Environment', 'Cancel'
		);

		if (selection !== 'Create Environment') {
			console.log('User declined to create Python environment');
			throw new Error('Python environment setup was cancelled. Please create a Python environment to run backtests.');
		}

		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Setting up Wick trading environment...",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Creating virtual environment..." });

				// Create venv
				await new Promise<void>((resolve, reject) => {
					console.log(`Creating venv at: ${venvPath}`);
					exec(`python3 -m venv "${venvPath}"`, (error, stdout, stderr) => {
						if (error) {
							console.log(`python3 failed, trying python: ${error.message}`);
							console.log(`stderr: ${stderr}`);
							// Try 'python' if 'python3' fails (e.g. Windows)
							exec(`python -m venv "${venvPath}"`, (err2, stdout2, stderr2) => {
								if (err2) {
									console.error(`Both python3 and python failed:`, err2.message);
									console.error(`stderr: ${stderr2}`);
									reject(new Error(`Failed to create venv. Please ensure Python 3 is installed.\n\nError: ${err2.message}\nDetails: ${stderr2}`));
								} else {
									console.log('venv created successfully with python');
									resolve();
								}
							});
						} else {
							console.log('venv created successfully with python3');
							resolve();
						}
					});
				});

				progress.report({ message: "Installing dependencies (this may take a minute)..." });

				// Install dependencies
				const packages = ['backtesting', 'yfinance', 'pandas', 'numpy'];
				// Note: TA-Lib is complex to install via pip automatically due to system deps.
				// We'll try to install it, but warn if it fails.

				await new Promise<void>((resolve, reject) => {
					const installCmd = `"${pipExecutable}" install ${packages.join(' ')}`;
					console.log(`Installing packages: ${installCmd}`);
					exec(installCmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
						if (error) {
							console.error(`Failed to install packages:`, error.message);
							console.error(`stdout: ${stdout}`);
							console.error(`stderr: ${stderr}`);
							reject(new Error(`Failed to install dependencies.\n\nError: ${error.message}\nDetails: ${stderr}`));
						} else {
							console.log(`Packages installed successfully`);
							console.log(`stdout: ${stdout}`);
							resolve();
						}
					});
				});

				// Try installing ta-lib separately (might fail if system deps missing)
				try {
					await new Promise<void>((resolve, reject) => {
						exec(`"${pipExecutable}" install TA-Lib`, (error) => {
							if (error) reject(error); else resolve();
						});
					});
				} catch (e) {
					vscode.window.showWarningMessage('Wick: Could not install TA-Lib automatically. You may need to install system dependencies.');
				}
			});

			vscode.window.showInformationMessage('Wick: Environment set up successfully!');
		} catch (error: any) {
			console.error('Failed to set up Python environment:', error);
			vscode.window.showErrorMessage(`Failed to set up Python environment: ${error.message}`);
			throw error;
		}
	}

	return pythonExecutable;
}

export async function fetchYahooCandles(
	symbol: string,
	range: string = "5y",      // e.g. "1d","5d","1mo","6mo","1y","5y","max","7d"
	interval: string = "1d"    // e.g. "1m","2m","5m","15m","1h","1d","1wk","1mo"
): Promise<Candle[]> {
	const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`;

	console.log(`Fetching ${symbol} from Yahoo Finance: range=${range}, interval=${interval}`);

	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0"
			}
		});

		if (!res.ok) {
			throw new Error(`Yahoo HTTP ${res.status} ${res.statusText}`);
		}

		const json = await res.json();
		const r = (json as any)?.chart?.result?.[0];

		if (!r) {
			throw new Error((json as any)?.chart?.error?.description || "No chart result");
		}

		const ts: number[] = r.timestamp ?? [];
		const q = r.indicators?.quote?.[0] ?? {};
		const o: number[] = q.open ?? [];
		const h: number[] = q.high ?? [];
		const l: number[] = q.low ?? [];
		const c: number[] = q.close ?? [];
		const v: number[] = q.volume ?? [];

		const candles: Candle[] = [];
		for (let i = 0; i < ts.length; i++) {
			const open = o[i], high = h[i], low = l[i], close = c[i];
			if ([open, high, low, close].some(x => x === null || Number.isNaN(x))) { continue; }
			candles.push({
				time: ts[i],
				open,
				high,
				low,
				close,
				volume: v?.[i]
			});
		}

		if (!candles.length) {
			throw new Error("No candles returned");
		}

		console.log(`Fetched ${candles.length} candles for ${symbol}`);
		return candles;

	} catch (error: any) {
		console.error(`Failed to fetch ${symbol}:`, error);
		throw new Error(`Failed to fetch ${symbol}: ${error.message}`);
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }