from pathlib import Path
import re

root = Path('c:/Users/Srimeenash/Desktop/INVENTORY/FE/dream-to-life-app')
endpoint_paths = {
    'authLogin': '/auth/login/',
    'authRegister': '/auth/register/',
    'roles': '/roles/',
    'vendors': '/vendors/',
    'components': '/components/components/',
    'componentRequests': '/components/components/',
    'projects': '/projects/projects/',
    'purchaseOrders': '/procurement/purchase-orders/',
    'manualLowStock': '/dashboard/manual-low-stock/',
    'purchaseRequests': '/procurement/purchase-requests/',
    'materialRequests': '/materialrequest/material-requests/',
    'notifications': '/notifications/',
    'bom': '/bom/bom/',
    'componentUsage': '/component-usage/',
    'outward': '/outward/',
}
import_regex = re.compile(r'import\s+config\s+from\s+["\"][^"\"]["\"];')

changed = []
for path in root.glob('src/**/*'):
    if path.suffix not in {'.js', '.jsx'}:
        continue
    if path.name == 'config.js':
        continue
    text = path.read_text(encoding='utf-8')
    orig = text
    text = text.replace('config.API_BASE_URL', 'config.baseURL')
    for key, endpoint in endpoint_paths.items():
        text = text.replace(f'config.API_ENDPOINTS.{key}', f'`${{config.baseURL}}{endpoint}`')
    text = text.replace('config.fetchJson', 'fetchJson')
    text = text.replace('config.fetchAuthenticatedJson', 'fetchAuthenticatedJson')
    text = re.sub(r'\$\{config\.baseURL\}/api/', '${config.baseURL}/', text)
    text = re.sub(r'config\.baseURL\s*\+\s*"/api/', 'config.baseURL + "/"', text)
    text = re.sub(r'config\.baseURL\s*\|\|\s*""\s*\)\s*/api/', 'config.baseURL || "" )/', text)
    if text != orig:
        if ('fetchJson' in text or 'fetchAuthenticatedJson' in text) and 'import { fetchJson, fetchAuthenticatedJson } from "@/api";' not in text:
            if import_regex.search(text):
                text = import_regex.sub(lambda m: m.group(0) + '\nimport { fetchJson, fetchAuthenticatedJson } from "@/api";', text, count=1)
        path.write_text(text, encoding='utf-8')
        changed.append(str(path.relative_to(root)))

for file in changed:
    print('updated', file)
