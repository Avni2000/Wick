# Wick Extension Test Suite

This directory contains all tests for the Wick VSCode extension.

## Test Structure

```
test/
├── extension.test.ts     # Main extension tests (activation, commands)
├── chart.test.ts         # Chart webview integration tests
```

## Running Tests

### Run all tests
```bash
npm test
```

### Quick test (skip linting)
```bash
npm run test:quick
```

### Pre-push validation
```bash
npm run pre-push
```

This runs a comprehensive check including:
1. TypeScript type checking
2. ESLint validation
3. Compilation
4. Full test suite

## Test Coverage

### Extension Tests (`extension.test.ts`)
- ✓ Extension presence and activation
- ✓ Command registration
- ✓ Command execution
- ✓ Webview creation

### Chart Tests (`chart.test.ts`)
- ✓ Webview HTML content validation
- ✓ Multiple instance creation
- ✓ Data structure validation
- ✓ Color configuration validation

### Unit Tests (`unit/webview.test.ts`)
- ✓ HTML structure validation
- ✓ CDN URL validation
- ✓ Candlestick data integrity
- ✓ Chart configuration structure
- ✓ Time format validation

## Writing New Tests

Tests use the Mocha framework with VSCode's test runner:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Your Test Suite', () => {
    test('Your test description', async () => {
        // Your test code
        assert.ok(true, 'Test passed');
    });
});
```

### Best Practices

1. **Use descriptive test names** - Make it clear what's being tested
2. **Set appropriate timeouts** - Use `this.timeout(5000)` for async operations
3. **Clean up resources** - Dispose of any created resources after tests
4. **Test one thing per test** - Keep tests focused and atomic
5. **Use proper assertions** - Choose the right assertion for the job

## Continuous Integration

Tests are automatically run on:
- Every push to main/master
- Every pull request
- Before publishing the extension

## Troubleshooting

### Tests fail locally but pass in CI
- Ensure you have the latest dependencies: `npm install`
- Check your VSCode version matches the required version
- Clear the `out/` directory and recompile: `rm -rf out && npm run compile-tests`

### Webview tests are flaky
- Webview creation can be asynchronous
- Increase timeout values if needed
- Ensure proper disposal of webviews between tests

### Type errors in tests
- Make sure `@types/vscode` and `@types/mocha` are up to date
- Run `npm run check-types` to see detailed type errors

