import * as assert from 'assert';
import * as vscode from 'vscode';
import { fetchYahooCandles } from '../extension';

suite('Wick Extension Test Suite', () => {
	vscode.window.showInformationMessage('Starting Wick extension tests...');

	test('Extension is present', () => {
		const extension = vscode.extensions.getExtension('Avni2000.wick');
		assert.ok(extension, 'Extension not found');
	});

	test('Extension activates', async () => {
		const extension = vscode.extensions.getExtension('Avni2000.wick');
		assert.ok(extension);
		await extension!.activate();
		assert.ok(extension!.isActive, 'Extension did not activate');
	});

	test('Command wick.showChart is registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const wickCommand = commands.find(cmd => cmd === 'wick.showChart');
		assert.ok(wickCommand, 'Command not registered');
	});

	test('Command executes without throwing', async () => {
		await vscode.commands.executeCommand('wick.showChart');
		assert.ok(true, 'Command executed');
	});

	test('fetchYahooCandles returns array', async function () {
		this.timeout(10000);
		const candles = await fetchYahooCandles('AAPL', '5d', '1d');
		assert.ok(Array.isArray(candles), 'Should return array');
	});

	test('fetchYahooCandles returns non-empty data', async function () {
		this.timeout(10000);
		const candles = await fetchYahooCandles('AAPL', '5d', '1d');
		assert.ok(candles.length > 0, 'Should return candles');
	});

	test('Candles have required fields', async function () {
		this.timeout(10000);
		const candles = await fetchYahooCandles('AAPL', '5d', '1d');
		const candle = candles[0];
		
		assert.ok('time' in candle, 'Candle should have time');
		assert.ok('open' in candle, 'Candle should have open');
		assert.ok('high' in candle, 'Candle should have high');
		assert.ok('low' in candle, 'Candle should have low');
		assert.ok('close' in candle, 'Candle should have close');
	});

	test('Candle time is unix timestamp', async function () {
		this.timeout(10000);
		const candles = await fetchYahooCandles('AAPL', '5d', '1d');
		const candle = candles[0];
		
		assert.strictEqual(typeof candle.time, 'number', 'time should be number');
		assert.ok(candle.time > 1000000000, 'time should be valid unix timestamp');
	});

	test('Candle OHLC are numbers', async function () {
		this.timeout(10000);
		const candles = await fetchYahooCandles('AAPL', '5d', '1d');
		const candle = candles[0];
		
		assert.strictEqual(typeof candle.open, 'number', 'open should be number');
		assert.strictEqual(typeof candle.high, 'number', 'high should be number');
		assert.strictEqual(typeof candle.low, 'number', 'low should be number');
		assert.strictEqual(typeof candle.close, 'number', 'close should be number');
	});

	test('Candle OHLC relationships are valid', async function () {
		this.timeout(10000);
		const candles = await fetchYahooCandles('AAPL', '5d', '1d');
		
		candles.forEach((candle, i) => {
			assert.ok(candle.high >= candle.low, `Candle ${i}: high >= low`);
			assert.ok(candle.high >= candle.open, `Candle ${i}: high >= open`);
			assert.ok(candle.high >= candle.close, `Candle ${i}: high >= close`);
			assert.ok(candle.low <= candle.open, `Candle ${i}: low <= open`);
			assert.ok(candle.low <= candle.close, `Candle ${i}: low <= close`);
		});
	});

	test('Candles are in chronological order', async function () {
		this.timeout(10000);
		const candles = await fetchYahooCandles('AAPL', '5d', '1d');
		
		for (let i = 1; i < candles.length; i++) {
			assert.ok(candles[i].time >= candles[i - 1].time, 'Candles should be in order');
		}
	});

	test('Different ranges return different data', async function () {
		this.timeout(10000);
		const candles1d = await fetchYahooCandles('AAPL', '1d', '5m');
		const candles5d = await fetchYahooCandles('AAPL', '5d', '1d');
		
		assert.notStrictEqual(candles1d.length, candles5d.length, 'Different ranges should return different counts');
	});

	test('Invalid ticker throws error', async function () {
		this.timeout(10000);
		await assert.rejects(
			async () => await fetchYahooCandles('INVALIDTICKER12345', '1d', '1d'),
			'Should throw error for invalid ticker'
		);
	});
});
