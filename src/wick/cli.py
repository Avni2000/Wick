"""
Wick CLI - Command Line Interface for Wick Trading Platform
"""
import argparse
import sys


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
    
    args = parser.parse_args()
    
    if args.command == "gui":
        run_gui(args.host, args.port, not args.no_browser)
    else:
        parser.print_help()
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
