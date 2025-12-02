"""
File Manager - Manages custom strategy files
"""
import json
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import re


def get_strategies_dir() -> Path:
    """Get the path to the strategies directory."""
    strategies_dir = Path.home() / ".wick" / "strategies"
    strategies_dir.mkdir(parents=True, exist_ok=True)
    return strategies_dir


def get_metadata_file() -> Path:
    """Get the path to the metadata file."""
    return get_strategies_dir() / "metadata.json"


def load_metadata() -> Dict:
    """Load strategy metadata."""
    metadata_file = get_metadata_file()
    if metadata_file.exists():
        with open(metadata_file, 'r') as f:
            return json.load(f)
    return {}


def save_metadata(metadata: Dict):
    """Save strategy metadata."""
    metadata_file = get_metadata_file()
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)


def sanitize_filename(name: str) -> str:
    """Sanitize filename to prevent directory traversal."""
    # Remove any path separators and keep only alphanumeric, underscore, hyphen
    name = re.sub(r'[^\w\-.]', '_', name)
    # Ensure it ends with .py
    if not name.endswith('.py'):
        name += '.py'
    return name


def list_strategy_files() -> List[Dict]:
    """List all strategy files with metadata."""
    strategies_dir = get_strategies_dir()
    metadata = load_metadata()
    
    files = []
    for file_path in strategies_dir.glob('*.py'):
        filename = file_path.name
        file_metadata = metadata.get(filename, {})
        
        files.append({
            'filename': filename,
            'created_date': file_metadata.get('created_date', datetime.now().isoformat()),
            'last_modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
            'size_bytes': file_path.stat().st_size,
            'description': file_metadata.get('description', ''),
        })
    
    return sorted(files, key=lambda x: x['last_modified'], reverse=True)


def save_strategy_file(filename: str, content: str, description: str = "") -> Dict:
    """Save a strategy file."""
    filename = sanitize_filename(filename)
    strategies_dir = get_strategies_dir()
    file_path = strategies_dir / filename
    
    # Check if this is a new file
    is_new = not file_path.exists()
    
    # Save the file
    with open(file_path, 'w') as f:
        f.write(content)
    
    # Update metadata
    metadata = load_metadata()
    if filename not in metadata:
        metadata[filename] = {
            'created_date': datetime.now().isoformat(),
            'description': description
        }
    else:
        metadata[filename]['description'] = description
    
    save_metadata(metadata)
    
    return {
        'success': True,
        'filename': filename,
        'is_new': is_new,
        'path': str(file_path)
    }


def load_strategy_file(filename: str) -> Optional[str]:
    """Load a strategy file content."""
    filename = sanitize_filename(filename)
    strategies_dir = get_strategies_dir()
    file_path = strategies_dir / filename
    
    if not file_path.exists():
        return None
    
    with open(file_path, 'r') as f:
        return f.read()


def delete_strategy_file(filename: str) -> bool:
    """Delete a strategy file."""
    filename = sanitize_filename(filename)
    strategies_dir = get_strategies_dir()
    file_path = strategies_dir / filename
    
    if not file_path.exists():
        return False
    
    # Delete the file
    file_path.unlink()
    
    # Remove from metadata
    metadata = load_metadata()
    if filename in metadata:
        del metadata[filename]
        save_metadata(metadata)
    
    return True


def validate_strategy_file(content: str) -> Dict:
    """Validate a strategy file content."""
    errors = []
    warnings = []
    
    # Check for Strategy import
    if 'from backtesting import Strategy' not in content and 'from backtesting import' not in content:
        errors.append("Missing 'from backtesting import Strategy' import")
    
    # Check for Strategy class definition
    if 'class' not in content or 'Strategy' not in content:
        errors.append("No Strategy class found. Must define a class that inherits from Strategy")
    
    # Check for init method
    if 'def init(' not in content and 'def init(self' not in content:
        warnings.append("No init() method found. This is usually required to set up indicators")
    
    # Check for next method
    if 'def next(' not in content and 'def next(self' not in content:
        errors.append("No next() method found. This is required for strategy logic")
    
    # Try to compile
    try:
        compile(content, '<string>', 'exec')
    except SyntaxError as e:
        errors.append(f"Syntax error: {str(e)}")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }


def get_strategy_path(filename: str) -> Path:
    """Get the full path to a strategy file."""
    filename = sanitize_filename(filename)
    return get_strategies_dir() / filename
