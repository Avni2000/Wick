# Change Log

All notable changes to the "wick" extension will be documented in this file.

## [0.0.1] - 2025-11-22

### Added
- **Live Market Data**: Integration with Yahoo Finance API for fetching historical stock data. 
- **Tests basic opening/closing/activation**: Starter test suite. 
### Technical Details
- Fetches up to 5 years of historical data from Yahoo Finance
- Supports multiple time intervals (1d default)
- Responsive chart rendering with ResizeObserver
- TypeScript strict mode enabled
- Test coverage for core functionality
### Basic github CI
- Builds and Tests with basic test suite.