# Wick - Project Summary

Wick is a VS Code extension designed to democratize algorithmic trading by providing a visual, node-based interface for building, backtesting, and deploying trading strategies directly within the editor.

## Key Features

### 1. Visual Strategy Builder
- **Node-Based Interface**: Built with Drawflow, allowing users to drag and drop nodes to create logic flows.
- **Components**:
  - **Indicators**: RSI, SMA, EMA, MACD, Bollinger Bands.
  - **Logic**: AND, OR gates for complex conditions.
  - **Price Data**: Open, High, Low, Close comparisons.
  - **Actions**: Buy/Sell triggers.
- **Code Generation**: Automatically translates the visual flow into valid Python code compatible with the `backtesting.py` framework.

### 2. Integrated Backtesting
- **Seamless Execution**: Run backtests directly from the builder.
- **Results View**: View key metrics (Return, Win Rate, Max Drawdown, etc.) immediately after simulation.
- **Python Backend**: Leverages a local Python environment to execute strategies, ensuring reliability and extensibility.

### 3. Wick Studio Mode
- **Zen Mode**: Hides VS Code's standard UI (Activity Bar, Status Bar) to focus entirely on the trading workflow.
- **Splitscreen Layout**: Intelligent window management keeps the Strategy Builder and Chart visible side-by-side.
- **Custom Sidebar**: A dedicated "Trading Dashboard" sidebar for managing strategies and settings.

### 4. Interactive Charting
- **Lightweight Charts**: High-performance financial charting.
- **Features**:
  - Candlestick and Line chart toggles.
  - Time range selection (1M, 3M, 6M, YTD, 1Y, ALL).
  - Crosshair and tooltip inspection.

## Technical Architecture

### Frontend (VS Code Webviews)
- **Framework-less**: Pure HTML/CSS/JavaScript for maximum performance and control.
- **Libraries**:
  - **Drawflow**: For the node editor.
  - **Lightweight Charts**: For rendering financial data.
  - **Font Awesome**: For UI icons.
- **Communication**: Uses the VS Code Webview Message API to communicate with the extension host.

### Backend (Extension Host & Python)
- **TypeScript**: Core extension logic, managing webviews, file systems, and process execution.
- **Python**: The `backtesting.py` library is used for the actual strategy simulation. The extension spawns Python processes to run backtests and captures the output.

## Challenges & Solutions

### State Management
Syncing state between the visual builder (nodes) and the underlying Python code.

**Solution**: Real-time code generation and parsing.

### Window Management
Creating a "Studio" feel within VS Code's rigid layout system.

**Solution**: Custom commands to toggle UI elements and intelligent editor group management.
