// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TextDecoder } from 'util';

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
	constructor(private readonly _extensionUri: vscode.Uri) { }

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = await this.getSidebarContent(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'showChart':
					vscode.commands.executeCommand('wick.showChart');
					break;
			}
		});
	}

	private async getSidebarContent(webview: vscode.Webview): Promise<string> {
		const uri = vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'sidebar.html');
		const uint8Array = await vscode.workspace.fs.readFile(uri);
		return new TextDecoder().decode(uint8Array);
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
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wick-main', provider)
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('wick.showChart', async () => {
		// Create and show a new webview panel
		const panel = vscode.window.createWebviewPanel(
			'wickChart', // Identifies the type of the webview. Used internally
			'Wick Chart', // Title of the panel displayed to the user
			vscode.ViewColumn.One, // Editor column to show the new webview panel in.
			{
				enableScripts: true // Enable scripts in the webview
			}
		);

		// Set the webview's HTML content
		panel.webview.html = await getWebviewContent('GOOGL', context.extensionUri);

		// Handle messages from the webview (for fetching data)
		panel.webview.onDidReceiveMessage(
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
							panel.webview.postMessage({
								type: 'candles',
								symbol: message.ticker,
								range: range,
								interval: interval,
								candles: candles
							});
						} catch (error: any) {
							panel.webview.postMessage({
								type: 'error',
								message: error.message
							});
						}
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	context.subscriptions.push(disposable);
}

async function getWebviewContent(ticker: string, extensionUri: vscode.Uri): Promise<string> {
	const uri = vscode.Uri.joinPath(extensionUri, 'src', 'views', 'chart.html');
	const uint8Array = await vscode.workspace.fs.readFile(uri);
	const template = new TextDecoder().decode(uint8Array);
	return template
		.replace('{{ticker}}', ticker) // Replace title (no quotes needed)
		.replace('{{ ticker }}', JSON.stringify(ticker)); // Replace JS variable (needs quotes)
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