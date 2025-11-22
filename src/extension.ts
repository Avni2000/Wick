// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this.getSidebarContent(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'openDashboard':
					vscode.commands.executeCommand('wick.openDashboard');
					break;
			}
		});
	}

	private getSidebarContent(webview: vscode.Webview): string {
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Wick Trading</title>
			<style>
				body {
					padding: 20px;
					color: var(--vscode-foreground);
					font-family: var(--vscode-font-family);
				}
				.action-button {
					width: 100%;
					padding: 12px;
					margin: 10px 0;
					background: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-size: 14px;
					font-weight: 500;
				}
				.action-button:hover {
					background: var(--vscode-button-hoverBackground);
				}
				.section {
					margin: 20px 0;
				}
				.section-title {
					font-size: 16px;
					font-weight: bold;
					margin-bottom: 10px;
					color: var(--vscode-foreground);
				}
				.description {
					font-size: 13px;
					color: var(--vscode-descriptionForeground);
					margin-bottom: 15px;
					line-height: 1.5;
				}
			</style>
		</head>
		<body>
			<div class="section">
				<div class="section-title">📈 Trading Dashboard</div>
				<div class="description">View charts, analyze stocks, and manage your trading strategies</div>
				<button class="action-button" onclick="openDashboard()">
					Open Dashboard
				</button>
			</div>
			
			<div class="section">
				<div class="section-title">🔍 Quick Actions</div>
				<button class="action-button" onclick="openDashboard()">
					Chart Viewer
				</button>
			</div>

			<script>
				const vscode = acquireVsCodeApi();
				
				function openDashboard() {
					vscode.postMessage({ command: 'openDashboard' });
				}
			</script>
		</body>
		</html>`;
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
		panel.webview.html = getWebviewContent('GOOGL');

		// Handle messages from the webview (for fetching data)
		panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'fetchStockData':
						try {
							const candles = await fetchYahooCandles(
								message.ticker,
								message.range || '5y',
								message.interval || '1d'
							);
							panel.webview.postMessage({
								type: 'candles',
								symbol: message.ticker,
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

	// Register the dashboard command
	const dashboardCommand = vscode.commands.registerCommand('wick.openDashboard', () => {
		const panel = vscode.window.createWebviewPanel(
			'wickDashboard',
			'Wick Trading Dashboard',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		panel.webview.html = getDashboardContent();

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'fetchStockData':
						const data = await fetchStockData(message.ticker, message.chartType);
						panel.webview.postMessage({ command: 'updateChart', data: data, ticker: message.ticker });
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	context.subscriptions.push(disposable, dashboardCommand);
}

function getWebviewContent(ticker: string = 'GOOG'): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      script-src https://unpkg.com 'unsafe-inline';
      style-src 'unsafe-inline';
      img-src 'self' data:;
      connect-src https:;
    "
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Candles - ${ticker}</title>
  <style>
    html, body { height: 100%; }
    body { margin: 0; background:#1e1e1e; color:#ccc; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Ubuntu,Cantarell,sans-serif; }
    #chart { width: 100%; height: 100vh; }
    .ticker-header { position:absolute; top:20px; left:20px; z-index:10; background:rgba(30,30,30,.9); padding:10px 14px; border-radius:8px; border:1px solid #3e3e42; }
    .ticker-name { font-size:18px; font-weight:700; color:#fff; }
    .ticker-price { font-size:14px; margin-top:4px; }
  </style>
</head>
<body>
  <div class="ticker-header">
    <div class="ticker-name" id="ticker"></div>
    <div class="ticker-price" id="price">Loading…</div>
  </div>
  <div id="chart"></div>

  <script>
    const TICKER = ${JSON.stringify(ticker)};
    const DEFAULT_RANGE = '5y'; // auto 5-year view
  </script>

  <script src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      const LWC = window.LightweightCharts;
      const container = document.getElementById('chart');
      const priceEl = document.getElementById('price');
      const tickerEl = document.getElementById('ticker');

      const chart = LWC.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { background: { color: '#1e1e1e' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: '#2b2b43' }, horzLines: { color: '#2b2b43' } },
        timeScale: { borderColor: '#485c7b' },
        rightPriceScale: { borderColor: '#485c7b' },
      });

      // Keep chart perfectly responsive
      new ResizeObserver(entries => {
        const cr = entries[0].contentRect;
        chart.applyOptions({ width: cr.width, height: cr.height });
      }).observe(container);

      // v5 API: use addSeries with CandlestickSeries
      const candles = chart.addSeries(LWC.CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        borderVisible: false,
      });

      tickerEl.textContent = TICKER.toUpperCase();
      priceEl.textContent = 'Fetching data...';

      // Request data from extension backend
      vscode.postMessage({
        command: 'fetchStockData',
        ticker: TICKER
      });

      // Handle messages from extension
      window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
          case 'candles':
            const data = message.candles;
            console.log('Received candles:', data.length);
            
            if (!data || !data.length) {
              priceEl.textContent = 'No data available';
              priceEl.style.color = '#ef5350';
              return;
            }

            candles.setData(data);
            chart.timeScale().fitContent();

            // Update price display
            const last = data[data.length - 1];
            const prev = data[data.length - 2] ?? last;
            const pct = prev.close ? (((last.close - prev.close) / prev.close) * 100).toFixed(2) : '0.00';
            priceEl.textContent = \`$\${last.close.toFixed(2)} (\${(last.close - prev.close >= 0 ? '+' : '') + pct}%)\`;
            priceEl.style.color = (last.close - prev.close) >= 0 ? '#26a69a' : '#ef5350';
            console.log('Chart loaded successfully!');
            break;
            
          case 'error':
            console.error('Error from extension:', message.message);
            priceEl.textContent = 'Error: ' + message.message;
            priceEl.style.color = '#ef5350';
            break;
        }
      });
    })();
  </script>
</body>
</html>`;
}
function getDashboardContent(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Wick Trading Dashboard</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		
		body {
			background-color: #1e1e1e;
			color: #cccccc;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			height: 100vh;
			display: flex;
			flex-direction: column;
		}
		
		/* Tab Navigation */
		.tabs {
			display: flex;
			background-color: #252526;
			border-bottom: 1px solid #3e3e42;
			padding: 0 10px;
		}
		
		.tab {
			padding: 12px 24px;
			cursor: pointer;
			background: none;
			border: none;
			color: #969696;
			font-size: 14px;
			border-bottom: 2px solid transparent;
			transition: all 0.2s;
		}
		
		.tab:hover {
			color: #cccccc;
			background-color: #2d2d30;
		}
		
		.tab.active {
			color: #ffffff;
			border-bottom-color: #007acc;
		}
		
		/* Tab Content */
		.tab-content {
			display: none;
			flex: 1;
			overflow: hidden;
		}
		
		.tab-content.active {
			display: flex;
			flex-direction: column;
		}
		
		/* Chart Controls */
		.controls {
			background-color: #252526;
			padding: 15px 20px;
			display: flex;
			gap: 15px;
			align-items: center;
			border-bottom: 1px solid #3e3e42;
			flex-wrap: wrap;
		}
		
		.search-container {
			flex: 1;
			min-width: 250px;
			display: flex;
			gap: 10px;
		}
		
		.search-input {
			flex: 1;
			padding: 8px 12px;
			background-color: #3c3c3c;
			border: 1px solid #3e3e42;
			color: #cccccc;
			border-radius: 4px;
			font-size: 14px;
		}
		
		.search-input:focus {
			outline: none;
			border-color: #007acc;
		}
		
		.search-button {
			padding: 8px 16px;
			background-color: #0e639c;
			color: white;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
		}
		
		.search-button:hover {
			background-color: #1177bb;
		}
		
		.chart-type-selector {
			display: flex;
			gap: 10px;
			align-items: center;
		}
		
		.chart-type-label {
			font-size: 13px;
			color: #969696;
		}
		
		.chart-type-btn {
			padding: 6px 14px;
			background-color: #3c3c3c;
			color: #cccccc;
			border: 1px solid #3e3e42;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
		}
		
		.chart-type-btn:hover {
			background-color: #505050;
		}
		
		.chart-type-btn.active {
			background-color: #0e639c;
			border-color: #007acc;
			color: white;
		}
		
		/* Chart Container */
		.chart-container {
			flex: 1;
			position: relative;
			background-color: #1e1e1e;
		}
		
		#chart {
			width: 100%;
			height: 100%;
		}
		
		.loading {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			font-size: 16px;
			color: #969696;
		}
		
		.ticker-info {
			padding: 8px 20px;
			background-color: #252526;
			border-bottom: 1px solid #3e3e42;
			display: flex;
			gap: 20px;
			align-items: center;
		}
		
		.ticker-name {
			font-size: 18px;
			font-weight: bold;
			color: #ffffff;
		}
		
		.ticker-price {
			font-size: 16px;
			color: #26a69a;
		}
		
		.ticker-change {
			font-size: 14px;
			padding: 4px 8px;
			border-radius: 4px;
		}
		
		.ticker-change.positive {
			color: #26a69a;
			background-color: rgba(38, 166, 154, 0.1);
		}
		
		.ticker-change.negative {
			color: #ef5350;
			background-color: rgba(239, 83, 80, 0.1);
		}

		/* Other tabs placeholder */
		.tab-placeholder {
			flex: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-direction: column;
			gap: 15px;
		}
		
		.tab-placeholder h2 {
			color: #ffffff;
			font-size: 24px;
		}
		
		.tab-placeholder p {
			color: #969696;
			font-size: 14px;
		}
	</style>
</head>
<body>
	<!-- Tab Navigation -->
	<div class="tabs">
		<button class="tab active" data-tab="charts">📈 Charts</button>
		<button class="tab" data-tab="backtest">🔬 Backtest</button>
		<button class="tab" data-tab="strategies">🤖 Strategies</button>
		<button class="tab" data-tab="deploy">🚀 Deploy</button>
	</div>
	
	<!-- Charts Tab -->
	<div class="tab-content active" id="charts-content">
		<div class="controls">
			<div class="search-container">
				<input 
					type="text" 
					class="search-input" 
					id="ticker-input" 
					placeholder="Enter ticker symbol (e.g., GOOG, AAPL, MSFT)" 
					value="GOOG"
				/>
				<button class="search-button" id="search-btn">Search</button>
			</div>
			
			<div class="chart-type-selector">
				<span class="chart-type-label">Chart Type:</span>
				<button class="chart-type-btn active" data-type="candlestick">Candlestick</button>
				<button class="chart-type-btn" data-type="line">Line</button>
			</div>
		</div>
		
		<div class="ticker-info" id="ticker-info" style="display: none;">
			<span class="ticker-name" id="ticker-name">GOOG</span>
			<span class="ticker-price" id="ticker-price">$0.00</span>
			<span class="ticker-change" id="ticker-change">+0.00%</span>
		</div>
		
		<div class="chart-container">
			<div id="chart"></div>
			<div class="loading" id="loading">Loading chart data...</div>
		</div>
	</div>
	
	<!-- Backtest Tab -->
	<div class="tab-content" id="backtest-content">
		<div class="tab-placeholder">
			<h2>🔬 Backtest</h2>
			<p>Backtest your trading strategies with historical data</p>
			<p style="font-size: 12px; color: #666;">Coming soon...</p>
		</div>
	</div>
	
	<!-- Strategies Tab -->
	<div class="tab-content" id="strategies-content">
		<div class="tab-placeholder">
			<h2>🤖 Strategies</h2>
			<p>Manage and create your trading strategies</p>
			<p style="font-size: 12px; color: #666;">Coming soon...</p>
		</div>
	</div>
	
	<!-- Deploy Tab -->
	<div class="tab-content" id="deploy-content">
		<div class="tab-placeholder">
			<h2>🚀 Deploy</h2>
			<p>Deploy your strategies to live trading</p>
			<p style="font-size: 12px; color: #666;">Coming soon...</p>
		</div>
	</div>

	<script src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
	<script>
		const vscode = acquireVsCodeApi();
		
		let chart = null;
		let currentSeries = null;
		let currentChartType = 'candlestick';
		let currentTicker = 'GOOG';
		
		// Tab switching
		document.querySelectorAll('.tab').forEach(tab => {
			tab.addEventListener('click', () => {
				const targetTab = tab.dataset.tab;
				
				// Update active tab
				document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				
				// Update active content
				document.querySelectorAll('.tab-content').forEach(content => {
					content.classList.remove('active');
				});
				document.getElementById(targetTab + '-content').classList.add('active');
				
				// Resize chart if switching to charts tab
				if (targetTab === 'charts' && chart) {
					setTimeout(() => {
						const container = document.querySelector('.chart-container');
						chart.applyOptions({
							width: container.clientWidth,
							height: container.clientHeight
						});
					}, 100);
				}
			});
		});
		
		// Chart type switching
		document.querySelectorAll('.chart-type-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				currentChartType = btn.dataset.type;
				fetchAndUpdateChart();
			});
		});
		
		// Search functionality
		document.getElementById('search-btn').addEventListener('click', () => {
			const ticker = document.getElementById('ticker-input').value.trim().toUpperCase();
			if (ticker) {
				currentTicker = ticker;
				fetchAndUpdateChart();
			}
		});
		
		document.getElementById('ticker-input').addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				document.getElementById('search-btn').click();
			}
		});
		
		// Initialize chart
		function initChart() {
			const container = document.getElementById('chart');
			const chartContainer = document.querySelector('.chart-container');
			
			chart = LightweightCharts.createChart(container, {
				width: chartContainer.clientWidth,
				height: chartContainer.clientHeight,
				layout: {
					background: { color: '#1e1e1e' },
					textColor: '#d1d4dc',
				},
				grid: {
					vertLines: { color: '#2b2b43' },
					horzLines: { color: '#2b2b43' },
				},
				timeScale: {
					borderColor: '#485c7b',
				},
				rightPriceScale: {
					borderColor: '#485c7b',
				},
			});
			
			// Handle window resize
			window.addEventListener('resize', () => {
				const container = document.querySelector('.chart-container');
				chart.applyOptions({
					width: container.clientWidth,
					height: container.clientHeight
				});
			});
		}
		
		function fetchAndUpdateChart() {
			document.getElementById('loading').style.display = 'block';
			vscode.postMessage({
				command: 'fetchStockData',
				ticker: currentTicker,
				chartType: currentChartType
			});
		}
		
		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.command) {
				case 'updateChart':
					updateChart(message.data, message.ticker);
					break;
			}
		});
		
		function updateChart(data, ticker) {
			document.getElementById('loading').style.display = 'none';
			
			if (!data || data.length === 0) {
				alert('No data available for ' + ticker);
				return;
			}
			
			// Remove old series
			if (currentSeries) {
				chart.removeSeries(currentSeries);
			}
			
			// Add new series based on chart type
			if (currentChartType === 'candlestick') {
				currentSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
					upColor: '#26a69a',
					downColor: '#ef5350',
					borderVisible: false,
					wickUpColor: '#26a69a',
					wickDownColor: '#ef5350',
				});
			} else {
				currentSeries = chart.addSeries(LightweightCharts.LineSeries, {
					color: '#2962FF',
					lineWidth: 2,
				});
			}
			
			currentSeries.setData(data);
			chart.timeScale().fitContent();
			
			// Update ticker info
			if (data.length > 0) {
				const latestData = data[data.length - 1];
				const prevData = data[data.length - 2] || latestData;
				
				let currentPrice, prevPrice;
				if (currentChartType === 'candlestick') {
					currentPrice = latestData.close;
					prevPrice = prevData.close;
				} else {
					currentPrice = latestData.value;
					prevPrice = prevData.value;
				}
				
				const change = ((currentPrice - prevPrice) / prevPrice * 100).toFixed(2);
				const changeClass = change >= 0 ? 'positive' : 'negative';
				const changeSign = change >= 0 ? '+' : '';
				
				document.getElementById('ticker-name').textContent = ticker;
				document.getElementById('ticker-price').textContent = '$' + currentPrice.toFixed(2);
				document.getElementById('ticker-change').textContent = changeSign + change + '%';
				document.getElementById('ticker-change').className = 'ticker-change ' + changeClass;
				document.getElementById('ticker-info').style.display = 'flex';
			}
		}
		
		// Initialize
		initChart();
		fetchAndUpdateChart();
	</script>
</body>
</html>`;
}

// Fetch stock data (mock data for now - replace with actual API)
async function fetchStockData(ticker: string, chartType: string): Promise<any[]> {
	// For demo purposes, we'll generate sample data
	// In production, replace this with actual API calls to Alpha Vantage, Yahoo Finance, etc.

	const data: any[] = [];
	const now = new Date();
	const basePrice = 100 + Math.random() * 50;

	for (let i = 60; i >= 0; i--) {
		const date = new Date(now);
		date.setDate(date.getDate() - i);

		// Skip weekends
		if (date.getDay() === 0 || date.getDay() === 6) {
			continue;
		}

		const dateStr = date.toISOString().split('T')[0];
		const volatility = 5;
		const drift = (Math.random() - 0.48) * 2;

		const open = basePrice + drift + (Math.random() - 0.5) * volatility;
		const close = open + (Math.random() - 0.5) * volatility * 2;
		const high = Math.max(open, close) + Math.random() * volatility;
		const low = Math.min(open, close) - Math.random() * volatility;

		if (chartType === 'candlestick') {
			data.push({
				time: dateStr,
				open: parseFloat(open.toFixed(2)),
				high: parseFloat(high.toFixed(2)),
				low: parseFloat(low.toFixed(2)),
				close: parseFloat(close.toFixed(2))
			});
		} else {
			data.push({
				time: dateStr,
				value: parseFloat(close.toFixed(2))
			});
		}
	}

	return data;
}

// Fetch real stock data from Yahoo Finance API
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