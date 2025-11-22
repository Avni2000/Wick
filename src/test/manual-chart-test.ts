/**
 * Manual test to verify chart rendering
 * Run this by opening the command palette and running "Wick: Show Chart"
 * Then check the Developer Console for any errors
 */

import * as vscode from 'vscode';

export async function testChartRendering() {
    console.log('=== Manual Chart Test ===');

    try {
        // Execute the show chart command
        await vscode.commands.executeCommand('wick.showChart');
        console.log('✓ Chart command executed successfully');

        // Wait a bit for the webview to load
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('Check if:');
        console.log('1. A webview panel opened with title "Wick Chart"');
        console.log('2. The GOOGL ticker header is visible');
        console.log('3. A candlestick chart is rendered');
        console.log('4. No console errors in Developer Tools (Help > Toggle Developer Tools)');

    } catch (error) {
        console.error('✗ Chart test failed:', error);
    }
}

// To run: Open command palette > Developer: Reload Window
// Then run: wick.showChart
