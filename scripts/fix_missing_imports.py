from pathlib import Path
import re

root = Path('c:/Users/Srimeenash/Desktop/INVENTORY/FE/dream-to-life-app')

api_import = 'import { fetchJson, fetchAuthenticatedJson } from "@/api";'
config_import = 'import config from "@/config";'

for path in sorted(root.glob('src/**/*')):
    if path.suffix not in {'.js', '.jsx'}:
        continue
    text = path.read_text(encoding='utf-8')
    orig = text
    needs_api = 'fetchAuthenticatedJson(' in text or 'fetchJson(' in text
    has_api = 'import { fetchJson, fetchAuthenticatedJson } from "@/api";' in text or 'import { fetchAuthenticatedJson } from "@/api";' in text or 'import { fetchJson } from "@/api";' in text
    needs_config = 'config.baseURL' in text or 'config.' in text
    has_config = 'import config from "@/config";' in text or 'import config from "./config";' in text or 'import config from "../config";' in text

    if needs_config and not has_config:
        # insert config import after last import statement or at top
        lines = text.splitlines()
        insert_index = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                insert_index = i + 1
        lines.insert(insert_index, config_import)
        text = '\n'.join(lines)

    if needs_api and not has_api:
        lines = text.splitlines()
        insert_index = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                insert_index = i + 1
        # avoid adding duplicate if already imported in some other form
        if api_import not in text:
            lines.insert(insert_index, api_import)
            text = '\n'.join(lines)

    if text != orig:
        path.write_text(text, encoding='utf-8')
        print('patched', path.relative_to(root))
