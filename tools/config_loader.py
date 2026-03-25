import os

def load_env(file_path=".env"):
    if not os.path.exists(file_path):
        # Try parent directory if not found in tools/
        parent_env = os.path.abspath(os.path.join(os.path.dirname(file_path), "..", ".env"))
        if os.path.exists(parent_env):
            file_path = parent_env
        else:
            return {}
            
    env_vars = {}
    with open(file_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env_vars[key.strip()] = value.strip()
    return env_vars

def get_tmdb_key():
    env = load_env()
    return env.get("TMDB_API_KEY", "743275e25bcea0a320b87d2af271a136") # Fallback to original
