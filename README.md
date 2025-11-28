# Wick

Wick is my solution to the cost and pains associated with algorithmic trading. In the past week or so, I've pivoted from:

1. Wick as an algorithmic trading and live deployment as a VSCode extension/custom IDE
2. Wick as a website
3. And finally Wick as an n8n like node-as-workflow-builder that runs and operates locally with BYOK for live, intraday trading. 

It's essentially a hybrid between scratch and n8n for people who can't be bothered to learn python.

## Installation

> [!WARNING]
> This project is almost entirely AI generated, and I haven't got the chance to review the last few commits. 
> Please be careful using it right now for anything serious


Install Wick as a pip package:

```bash
git clone https://github.com/Avni2000/Wick.git
cd Wick
pip install -e .
```

Then launch the GUI in your browser:

```bash
wick gui
```

This will start the server at `http://127.0.0.1:8000` and open your browser automatically.

### CLI Options

```bash
wick gui --help           # Show all options
wick gui --port 3000      # Use a different port
wick gui --no-browser     # Don't open browser automatically
```

## Development

For development, you can run the frontend and backend separately:

### Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate # or whatever shell you have
pip install -r requirements.txt
python main.py
```

### Frontend:
```bash
cd frontend
npm install
npm run dev
```

### Building the Package

To build the pip package with the frontend:

```bash
cd frontend
npm run build  # Builds to src/wick/static/

# Then install locally
pip install -e .
```

## TODO

- Paper trade -> trade locally
- Allow BYOK. I plan on using Public, but I would like to add support for Alpaca and a few others too.

Contributions welcome.