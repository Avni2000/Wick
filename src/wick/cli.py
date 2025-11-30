"""
Wick CLI - Command Line Interface for Wick Trading Platform
"""
import argparse
import sys
import json
from pathlib import Path


def main():
    """Main entry point for the wick CLI."""
    parser = argparse.ArgumentParser(
        prog="wick",
        description="Wick - Visual Trading Strategy Builder and Backtesting Platform"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # GUI command
    gui_parser = subparsers.add_parser("gui", help="Launch the Wick web interface")
    gui_parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind the server to (default: 127.0.0.1)"
    )
    gui_parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to run the server on (default: 8000)"
    )
    gui_parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Don't automatically open the browser"
    )
    
    # Config command
    config_parser = subparsers.add_parser("config", help="Manage API configuration")
    config_parser.add_argument(
        "--set-api-key",
        metavar="KEY",
        help="Set your Public.com API key for live trading"
    )
    config_parser.add_argument(
        "--show",
        action="store_true",
        help="Show current configuration (API key will be masked)"
    )
    
    args = parser.parse_args()
    
    if args.command == "gui":
        run_gui(args.host, args.port, not args.no_browser)
    elif args.command == "config":
        manage_config(args)
    else:
        parser.print_help()
        sys.exit(1)

def get_config_path() -> Path:
    """Get the path to the configuration file."""
    config_dir = Path.home() / ".wick"
    config_dir.mkdir(exist_ok=True)
    return config_dir / "config.json"


def load_config() -> dict:
    """Load configuration from file."""
    config_path = get_config_path()
    if config_path.exists():
        with open(config_path, 'r') as f:
            return json.load(f)
    return {}


def save_config(config: dict):
    """Save configuration to file."""
    config_path = get_config_path()
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)


def manage_config(args):
    """Manage API configuration."""
    if args.set_api_key:
        config = load_config()
        config['api_key'] = args.set_api_key
        save_config(config)
        print(f"✅ API key saved to {get_config_path()}")
        print("   You can now use live trading mode in the GUI.")
    elif args.show:
        config = load_config()
        if 'api_key' in config and config['api_key']:
            masked_key = config['api_key'][:4] + "*" * (len(config['api_key']) - 8) + config['api_key'][-4:]
            print(f"📋 Configuration stored in: {get_config_path()}")
            print(f"   API Key: {masked_key}")
        else:
            print(f"📋 Configuration stored in: {get_config_path()}")
            print("   No API key configured.")
            print("\n   To set your API key, run:")
            print("   wick config --set-api-key YOUR_API_KEY")
    else:
        print("Usage: wick config [--set-api-key KEY] [--show]")
        sys.exit(1)


def run_gui(host: str, port: int, open_browser: bool = True):
    """Launch the Wick GUI server."""
    import uvicorn
    import webbrowser
    import threading
    
    from wick.server import app
    
    url = f"http://{host}:{port}"
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🕯️  Wick - Visual Trading Strategy Builder                 ║
║                                                              ║
║   Starting server at: {url:<36} ║
║                                                              ║
║   Press Ctrl+C to stop the server                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    if open_browser:
        # Open browser after a short delay to let server start
        def open_browser_delayed():
            import time
            time.sleep(1.5)
            webbrowser.open(url)
        
        threading.Thread(target=open_browser_delayed, daemon=True).start()
    
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()

