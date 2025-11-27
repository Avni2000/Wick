# Wick

Wick is my solution to the cost and pains associated with algorithmic trading. In the past week or so, I've pivoted from:

1. Wick as an algorithmic trading and live deployment as a VSCode extension/custom IDE
2. Wick as a website
3. Wick as an n8n like node-as-workflow-builder that runs and operates locally with BYOK for live, intraday trading. 

It's essentially a hybrid between scratch and n8n for people who can't be bothered to learn python.


## TODO

- Pack as pip/python-first package with a web gui component
- Paper trade -> trade locally
- Allow BYOK. I plan on using Public, but I would like to add support for Alpaca and a few others too.

## Run/Develop (Currently)

Very typical for python backend web apps:

Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate # or whatever shell you have
pip install -r requirements.txt
python main.py
```
Frontend:
```bash
cd frontend
npm install
npm run dev
```

Contributions welcome.