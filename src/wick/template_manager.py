"""
Template Manager - Manages strategy templates
"""
from pathlib import Path
from typing import List, Dict


def get_templates_dir() -> Path:
    """Get the path to the templates directory."""
    return Path(__file__).parent / "templates"


def list_templates() -> List[Dict]:
    """List all available strategy templates."""
    templates_dir = get_templates_dir()
    
    templates = []
    for file_path in templates_dir.glob('*.py'):
        # Read first few lines for description
        with open(file_path, 'r') as f:
            content = f.read()
            # Extract docstring as description
            lines = content.split('\n')
            description  = ""
            if '"""' in content:
                start = content.find('"""') + 3
                end = content.find('"""', start)
                if end > start:
                    description = content[start:end].strip()
        
        templates.append({
            'name': file_path.stem,
            'filename': file_path.name,
            'description': description[:200] + '...' if len(description) > 200 else description,
            'full_description': description
        })
    
    return sorted(templates, key=lambda x: x['name'])


def load_template(template_name: str) -> str:
    """Load a template's content."""
    templates_dir = get_templates_dir()
    
    # Try with .py extension
    if not template_name.endswith('.py'):
        template_name += '.py'
    
    file_path = templates_dir / template_name
    
    if not file_path.exists():
        raise FileNotFoundError(f"Template '{template_name}' not found")
    
    with open(file_path, 'r') as f:
        return f.read()
